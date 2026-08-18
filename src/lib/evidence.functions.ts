import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MAX_BYTES = 25 * 1024 * 1024;

const UploadUrlInput = z.object({
  fileName: z.string().min(1).max(200),
  mediaKind: z.enum(["image", "video", "audio"]),
  mimeType: z.string().min(3).max(120),
  fileSize: z.number().int().min(1).max(MAX_BYTES),
});

/**
 * Step 1 — mint a short-lived, single-use signed upload URL scoped to the
 * caller's own folder. The browser never holds a bucket-wide credential.
 */
export const createEvidenceUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadUrlInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const safeName = data.fileName.replace(/[^\w.-]/g, "_").slice(-80);
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage.from("evidence").createSignedUploadUrl(path);
    if (signed.error || !signed.data) throw new Error("Could not prepare a secure upload");

    return { path, token: signed.data.token, signedUrl: signed.data.signedUrl };
  });

const RegisterInput = z.object({
  storagePath: z.string().min(3).max(400),
  mediaKind: z.enum(["image", "video", "audio"]),
  mimeType: z.string().min(3).max(120),
  fileSize: z.number().int().min(0).max(MAX_BYTES),
  contentId: z.string().uuid().nullable().optional(),
  reportId: z.string().uuid().nullable().optional(),
});

/**
 * Step 2 — register the uploaded file as evidence and run the OCR /
 * speech-to-text job, tracking its status so progress and retries are visible.
 */
export const analyzeEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.storagePath.startsWith(`${userId}/`)) throw new Error("Invalid evidence path");

    const { data: row, error } = await supabase
      .from("media_evidence")
      .insert({
        uploader_id: userId,
        content_id: data.contentId ?? null,
        report_id: data.reportId ?? null,
        storage_path: data.storagePath,
        media_kind: data.mediaKind,
        mime_type: data.mimeType,
        file_size: data.fileSize,
        status: "pending",
        job_status: "queued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "evidence.uploaded",
      object_type: "media_evidence",
      object_id: row.id,
      details: { media_kind: data.mediaKind, file_size: data.fileSize },
    });

    const { runExtractionJob } = await import("./evidence.server");
    const result = await runExtractionJob(row.id);
    return result;
  });

/** Re-run a failed or incomplete extraction. Uploader or staff only. */
export const retryEvidenceExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ evidenceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS already limits visibility to the uploader, staff and auditors.
    const { data: row, error } = await supabase
      .from("media_evidence")
      .select("id, legal_hold, status")
      .eq("id", data.evidenceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Evidence not found");
    if (row.status === "erased") throw new Error("This evidence was erased and cannot be re-run");

    const { runExtractionJob } = await import("./evidence.server");
    return runExtractionJob(data.evidenceId);
  });

/** Short-lived signed URL, only for people RLS already lets read the evidence row. */
export const getEvidenceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ evidenceId: z.string().uuid(), expiresIn: z.number().int().min(30).max(900).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("media_evidence")
      .select("storage_path, status")
      .eq("id", data.evidenceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Evidence not found");
    if (row.status === "erased") throw new Error("This media was erased at the owner's request");

    const expiresIn = data.expiresIn ?? 300;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage
      .from("evidence")
      .createSignedUrl(row.storage_path, expiresIn);
    if (signed.error || !signed.data) throw new Error("Could not open evidence");

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      event_type: "evidence.viewed",
      object_type: "media_evidence",
      object_id: data.evidenceId,
      details: { expires_in_seconds: expiresIn },
    });

    return { url: signed.data.signedUrl, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  });

/** Moderators mark multimodal evidence reviewed or place it under legal hold. */
export const reviewEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        evidenceId: z.string().uuid(),
        status: z.enum(["pending", "reviewed", "dismissed", "escalated"]),
        legalHold: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Forbidden: moderator role required");

    const { error } = await supabase
      .from("media_evidence")
      .update({
        status: data.status,
        ...(data.legalHold === undefined ? {} : { legal_hold: data.legalHold }),
      })
      .eq("id", data.evidenceId);
    if (error) throw new Error(error.message);

    if (data.status === "escalated") {
      await supabase.from("notifications").insert({
        audience: "staff",
        kind: "escalation",
        severity: "high",
        title: "Evidence escalated for specialist review",
        object_type: "media_evidence",
        object_id: data.evidenceId,
      });
    }

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "evidence.reviewed",
      object_type: "media_evidence",
      object_id: data.evidenceId,
      details: { status: data.status, legal_hold: data.legalHold ?? null },
    });
    return { ok: true };
  });
