import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TextInput = z.object({
  text: z.string().min(1).max(5000),
  conversationId: z.string().max(120).optional(),
});

const PublishInput = TextInput.extend({
  acknowledgedWarning: z.boolean().default(false),
});

const DecisionInput = z.object({
  contentId: z.string().uuid(),
  reportId: z.string().uuid().nullable().optional(),
  decision: z.enum([
    "confirm_violation",
    "reject_false_positive",
    "request_more_context",
    "escalate_specialist",
    "mark_quotation_or_self_defense",
  ]),
  action: z.enum(["none", "warn", "reduce_visibility", "hide", "restrict_account", "escalate"]),
  reason: z.string().max(2000).optional(),
  policyCode: z.string().max(60).optional(),
});

/** Pre-publication check: analyse without storing anything. */
export const previewAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TextInput.parse(d))
  .handler(async ({ data, context }) => {
    const { classifyText } = await import("./analysis.server");
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());

    return classifyText(data.text, {
      senderRecentMessages: count ?? 0,
      messagesToSameTarget: 0,
      priorConfirmedIncidents: 0,
      targetHasBlockedSender: false,
    });
  });

/** Publish content: analyse, aggregate risk, store prediction, apply automated (reversible) action. */
export const publishContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PublishInput.parse(d))
  .handler(async ({ data, context }) => {
    const { classifyText, sanitizeText } = await import("./analysis.server");
    const { supabase, userId } = context;

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [{ count: recent }, { count: incidents }] = await Promise.all([
      supabase
        .from("content_items")
        .select("id", { count: "exact", head: true })
        .eq("author_id", userId)
        .gte("created_at", since),
      supabase
        .from("moderation_decisions")
        .select("id", { count: "exact", head: true })
        .eq("decision", "confirm_violation"),
    ]);

    const analysis = await classifyText(data.text, {
      senderRecentMessages: recent ?? 0,
      messagesToSameTarget: data.conversationId ? (recent ?? 0) : 0,
      priorConfirmedIncidents: 0,
      targetHasBlockedSender: false,
    });
    void incidents;

    if (analysis.severity === "low" && !data.acknowledgedWarning) {
      return { status: "warned" as const, analysis, contentId: null };
    }

    const visibility =
      analysis.severity === "critical" || analysis.severity === "high"
        ? "hidden"
        : analysis.severity === "medium"
          ? "reduced"
          : "visible";

    const { data: item, error } = await supabase
      .from("content_items")
      .insert({
        author_id: userId,
        body: sanitizeText(data.text),
        conversation_id: data.conversationId ?? null,
        language: analysis.language,
        visibility_status: visibility,
        severity: analysis.severity,
        requires_review: analysis.requires_review,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("model_predictions").insert({
      content_id: item.id,
      model_version: analysis.model_version,
      labels: analysis.labels,
      severity: analysis.severity,
      confidence: analysis.confidence,
      target_detected: analysis.target_detected,
      repetition_score: analysis.repetition_score,
      final_risk: analysis.final_risk,
      explanation: analysis.explanation,
      recommended_action: analysis.recommended_action,
      requires_review: analysis.requires_review,
    });

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "content.published",
      object_type: "content",
      object_id: item.id,
      details: {
        severity: analysis.severity,
        action: analysis.recommended_action,
        model_version: analysis.model_version,
      },
    });

    return { status: "published" as const, analysis, contentId: item.id };
  });

/** Moderator decision — the only place enforcement becomes real. */
export const submitDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecisionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Forbidden: moderator role required");

    const { error: decErr } = await supabase.from("moderation_decisions").insert({
      report_id: data.reportId ?? null,
      content_id: data.contentId,
      moderator_id: userId,
      decision: data.decision,
      action_taken: data.action,
      reason: data.reason ?? null,
      policy_code: data.policyCode ?? null,
    });
    if (decErr) throw new Error(decErr.message);

    const visibility =
      data.action === "hide"
        ? "hidden"
        : data.action === "reduce_visibility"
          ? "reduced"
          : data.decision === "reject_false_positive" ||
              data.decision === "mark_quotation_or_self_defense"
            ? "visible"
            : null;

    await supabase
      .from("content_items")
      .update({
        requires_review: data.decision === "request_more_context",
        ...(visibility ? { visibility_status: visibility } : {}),
      })
      .eq("id", data.contentId);

    if (data.reportId) {
      await supabase
        .from("reports")
        .update({
          status: data.decision === "escalate_specialist" ? "escalated" : "closed",
          closed_at: new Date().toISOString(),
          assigned_moderator_id: userId,
        })
        .eq("id", data.reportId);
    }

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "moderation.decision",
      object_type: "content",
      object_id: data.contentId,
      details: { decision: data.decision, action: data.action, policy: data.policyCode ?? null },
    });

    return { ok: true };
  });

/** Demo bootstrap: the first account can claim the staff roles so the console is reachable. */
export const claimStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("claim_admin_roles");
    if (error) throw new Error(error.message);
    return data as { ok: boolean; alreadyProvisioned: boolean };
  });

/** Admins grant or revoke roles. */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        role: z.enum(["user", "moderator", "admin", "auditor", "counselor", "data_scientist"]),
        grant: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("set_user_role_rpc", {
      _target_user_id: data.targetUserId,
      _role: data.role,
      _grant: data.grant,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Appeal review by staff. */
export const resolveAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        appealId: z.string().uuid(),
        status: z.enum(["upheld", "overturned"]),
        resolution: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Forbidden: moderator role required");
    const { error } = await supabase
      .from("appeals")
      .update({
        status: data.status,
        resolution: data.resolution ?? null,
        reviewer_id: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.appealId);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "appeal.resolved",
      object_type: "appeal",
      object_id: data.appealId,
      details: { status: data.status },
    });
    return { ok: true };
  });
