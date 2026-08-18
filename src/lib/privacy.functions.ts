import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RequestInput = z.object({
  requestType: z.enum(["data_deletion", "consent_withdrawal"]),
  scope: z.enum(["content", "account", "analytics_only"]).default("content"),
  reason: z.string().max(1000).optional(),
});

/** Version of the retention & redaction policy applied to a completed request. */
export const PRIVACY_POLICY_VERSION = "safespace-privacy-2026.02";

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Step 1 — user files a request and receives a confirmation code. Nothing is deleted yet. */
export const createPrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const code = makeCode();

    const { data: row, error } = await supabase
      .from("privacy_requests")
      .insert({
        user_id: userId,
        request_type: data.requestType,
        scope: data.scope,
        reason: data.reason ?? null,
        confirmation_code: code,
        status: "awaiting_confirmation",
      })
      .select("id, confirmation_code, request_type, scope, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "privacy.request_created",
      object_type: "privacy_request",
      object_id: row.id,
      details: { request_type: data.requestType, scope: data.scope },
    });
    return row;
  });

/** Step 2 — user re-types the code. Personal data goes; evidence needed for open cases is preserved. */
export const confirmPrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid(), code: z.string().min(4).max(12) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: req, error: reqErr } = await supabase
      .from("privacy_requests")
      .select("id, user_id, request_type, scope, status, confirmation_code")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!req || req.user_id !== userId) throw new Error("Request not found");
    if (req.status === "completed") return { ok: true, alreadyCompleted: true, preserved: 0 };
    if (req.confirmation_code !== data.code.trim().toUpperCase())
      throw new Error("Confirmation code does not match");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Evidence tied to an open report, a recorded decision, or a legal hold must survive deletion.
    const { data: evidence } = await supabaseAdmin
      .from("media_evidence")
      .select("id, report_id, content_id, legal_hold")
      .eq("uploader_id", userId);

    const { data: decidedContent } = await supabaseAdmin
      .from("moderation_decisions")
      .select("content_id");
    const decidedIds = new Set((decidedContent ?? []).map((d) => d.content_id).filter(Boolean));

    const preserved = (evidence ?? []).filter(
      (e) => e.legal_hold || e.report_id || (e.content_id && decidedIds.has(e.content_id)),
    );
    if (preserved.length) {
      await supabaseAdmin
        .from("media_evidence")
        .update({ legal_hold: true })
        .in(
          "id",
          preserved.map((e) => e.id),
        );
    }
    const removableEvidence = (evidence ?? []).filter(
      (e) => !preserved.some((p) => p.id === e.id),
    );
    if (removableEvidence.length) {
      const { data: paths } = await supabaseAdmin
        .from("media_evidence")
        .select("id, storage_path")
        .in(
          "id",
          removableEvidence.map((e) => e.id),
        );
      if (paths?.length) {
        await supabaseAdmin.storage.from("evidence").remove(paths.map((p) => p.storage_path));
        await supabaseAdmin
          .from("media_evidence")
          .update({ status: "erased", ocr_text: null, transcript: null, analysis: {} })
          .in(
            "id",
            paths.map((p) => p.id),
          );
      }
    }

    if (req.request_type === "data_deletion") {
      const { data: own } = await supabaseAdmin
        .from("content_items")
        .select("id")
        .eq("author_id", userId);
      const keepIds = new Set(
        (own ?? []).map((c) => c.id).filter((id) => decidedIds.has(id)),
      );
      for (const c of own ?? []) {
        await supabaseAdmin
          .from("content_items")
          .update(
            keepIds.has(c.id)
              ? { body: "[erased at author request — retained record of a moderated case]", visibility_status: "hidden" }
              : { body: "[erased at author request]", visibility_status: "hidden", deleted_at: new Date().toISOString() },
          )
          .eq("id", c.id);
      }
      await supabaseAdmin
        .from("profiles")
        .update({
          display_name: "Erased user",
          consent_status: false,
          account_status: req.scope === "account" ? "deleted" : "active",
        })
        .eq("id", userId);
    } else {
      await supabaseAdmin
        .from("profiles")
        .update({ consent_status: false, account_status: "consent_withdrawn" })
        .eq("id", userId);
      await supabaseAdmin
        .from("content_items")
        .update({ visibility_status: "hidden" })
        .eq("author_id", userId);
    }

    // Receipt data: what was redacted, under which policy, and by which models.
    const { data: erasedRows } = await supabaseAdmin
      .from("media_evidence")
      .select("model_version")
      .eq("uploader_id", userId);
    const modelVersions = Array.from(
      new Set([
        ...(erasedRows ?? []).map((r) => r.model_version).filter((v): v is string => Boolean(v)),
        "google/gemini-3.5-flash",
      ]),
    );
    const { count: contentCount } = await supabaseAdmin
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId);

    const receiptCode = `RCP-${makeCode()}-${makeCode()}`;
    const redactionSummary = {
      request_type: req.request_type,
      scope: req.scope,
      content_items_redacted: contentCount ?? 0,
      evidence_files_erased: removableEvidence.length,
      evidence_items_preserved: preserved.length,
      profile_anonymised: req.request_type === "data_deletion",
      consent_withdrawn: true,
      derived_text_removed: ["ocr_text", "transcript", "analysis"],
      completed_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabaseAdmin
      .from("privacy_requests")
      .update({
        status: "completed",
        confirmed_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        preserved_evidence: preserved.map((p) => ({ evidence_id: p.id, reason: "open_case_or_legal_hold" })),
        redaction_summary: redactionSummary,
        policy_version: PRIVACY_POLICY_VERSION,
        model_versions: modelVersions,
        receipt_code: receiptCode,
        outcome_note:
          req.request_type === "data_deletion"
            ? `Personal content erased. ${preserved.length} evidence item(s) preserved under legal hold for open or decided cases.`
            : `Consent withdrawn: automated analysis stopped and content hidden. ${preserved.length} evidence item(s) preserved.`,
      })
      .eq("id", req.id);
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      event_type:
        req.request_type === "data_deletion" ? "privacy.data_deleted" : "privacy.consent_withdrawn",
      object_type: "privacy_request",
      object_id: req.id,
      details: {
        scope: req.scope,
        preserved_evidence: preserved.length,
        erased_evidence: removableEvidence.length,
      },
    });

    return {
      ok: true,
      alreadyCompleted: false,
      preserved: preserved.length,
      receiptCode,
      redactionSummary,
      policyVersion: PRIVACY_POLICY_VERSION,
      modelVersions,
    };
  });

/** User-facing receipt: redaction summary, policy/model versions, preserved-evidence proof. */
export const getPrivacyReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error } = await supabase
      .from("privacy_requests")
      .select(
        "id, user_id, request_type, scope, status, receipt_code, redaction_summary, policy_version, model_versions, preserved_evidence, outcome_note, created_at, confirmed_at, processed_at",
      )
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Request not found");
    if (req.status !== "completed") throw new Error("Receipt is available once the request completes");

    // Auditable confirmation that preserved evidence really is still held.
    const preserved = Array.isArray(req.preserved_evidence)
      ? (req.preserved_evidence as Array<{ evidence_id: string; reason: string }>)
      : [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: held } = preserved.length
      ? await supabaseAdmin
          .from("media_evidence")
          .select("id, legal_hold, status, report_id, content_id")
          .in(
            "id",
            preserved.map((p) => p.evidence_id),
          )
      : { data: [] };

    const { data: trail } = await supabase
      .from("audit_logs")
      .select("event_type, created_at, details")
      .eq("object_id", req.id)
      .order("created_at", { ascending: true });

    if (req.user_id === userId) {
      await supabase.from("audit_logs").insert({
        actor_id: userId,
        event_type: "privacy.receipt_issued",
        object_type: "privacy_request",
        object_id: req.id,
        details: { receipt_code: req.receipt_code },
      });
    }

    return {
      requestId: req.id,
      requestType: req.request_type,
      scope: req.scope,
      receiptCode: req.receipt_code,
      policyVersion: req.policy_version,
      modelVersions: (req.model_versions ?? []) as string[],
      redactionSummary: (req.redaction_summary ?? {}) as Record<string, string | number | boolean | string[]>,
      outcomeNote: req.outcome_note,
      createdAt: req.created_at,
      confirmedAt: req.confirmed_at,
      processedAt: req.processed_at,
      preservedEvidence: (held ?? []).map((h) => ({
        evidenceId: h.id,
        legalHold: h.legal_hold,
        status: h.status,
        linkedToReport: Boolean(h.report_id),
        linkedToContent: Boolean(h.content_id),
      })),
      auditTrail: (trail ?? []).map((t) => ({
        event: t.event_type,
        at: t.created_at,
        details: t.details,
      })),
    };
  });

/** Staff annotate or close a request (for scopes needing manual handling). */
export const annotatePrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        status: z.enum(["awaiting_confirmation", "in_review", "completed", "rejected"]),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Forbidden: staff role required");

    const { error } = await supabase
      .from("privacy_requests")
      .update({
        status: data.status,
        outcome_note: data.note ?? null,
        processed_by: userId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "privacy.request_updated",
      object_type: "privacy_request",
      object_id: data.requestId,
      details: { status: data.status },
    });
    return { ok: true };
  });
