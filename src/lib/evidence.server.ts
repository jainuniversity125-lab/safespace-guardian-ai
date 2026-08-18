// Server-only: the background extraction pipeline for one evidence row.
import { extractFromMedia, extractionToText } from "./multimodal.server";
import { classifyText } from "./analysis.server";

export type EvidenceJobResult = {
  id: string;
  job_status: string;
  job_attempts: number;
  severity: string;
};

/**
 * Runs OCR / speech-to-text for an evidence row, scores the extracted text and
 * writes progress (queued → processing → done/failed) so users and moderators
 * can watch the job and retry it.
 */
export async function runExtractionJob(evidenceId: string): Promise<EvidenceJobResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("media_evidence")
    .select("id, uploader_id, storage_path, media_kind, mime_type, job_attempts, report_id, content_id")
    .eq("id", evidenceId)
    .maybeSingle();
  if (error || !row) throw new Error("Evidence not found");

  const attempt = (row.job_attempts ?? 0) + 1;
  const startedAt = Date.now();
  await supabaseAdmin
    .from("media_evidence")
    .update({
      job_status: "processing",
      job_attempts: attempt,
      job_error: null,
      job_started_at: new Date(startedAt).toISOString(),
    })
    .eq("id", evidenceId);

  try {
    const file = await supabaseAdmin.storage.from("evidence").download(row.storage_path);
    if (file.error || !file.data) throw new Error("Uploaded file could not be read");

    const extraction = await extractFromMedia(
      await file.data.arrayBuffer(),
      row.mime_type,
      row.media_kind as "image" | "video" | "audio",
    );

    const text = extractionToText(extraction);
    const analysis = text
      ? await classifyText(text, {
          senderRecentMessages: 0,
          messagesToSameTarget: 0,
          priorConfirmedIncidents: 0,
          targetHasBlockedSender: false,
        })
      : null;

    const severity = analysis?.severity ?? "safe";
    const { error: updErr } = await supabaseAdmin
      .from("media_evidence")
      .update({
        ocr_text: extraction.ocr_text || null,
        transcript: extraction.transcript || null,
        ocr_confidence: extraction.ocr_confidence,
        transcript_confidence: extraction.transcript_confidence,
        segments: extraction.segments,
        model_version: extraction.model_version,
        analysis: {
          visual_description: extraction.visual_description,
          notes: extraction.notes,
          ...(analysis
            ? {
                labels: analysis.labels,
                confidence: analysis.confidence,
                final_risk: analysis.final_risk,
                explanation: analysis.explanation,
                recommended_action: analysis.recommended_action,
                model_version: analysis.model_version,
              }
            : {}),
        },
        severity,
        status: severity !== "safe" ? "pending" : "reviewed",
        job_status: "done",
        job_completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", evidenceId);
    if (updErr) throw new Error(updErr.message);

    if (severity === "high" || severity === "critical") {
      await supabaseAdmin.from("notifications").insert({
        audience: "staff",
        kind: "priority_evidence",
        severity,
        title: `Priority evidence: ${row.media_kind} scored ${severity}`,
        body: (extraction.ocr_text || extraction.transcript || extraction.visual_description).slice(
          0,
          240,
        ),
        object_type: "media_evidence",
        object_id: evidenceId,
      });
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: row.uploader_id,
      event_type: "evidence.extraction_completed",
      object_type: "media_evidence",
      object_id: evidenceId,
      details: {
        attempt,
        severity,
        model_version: extraction.model_version,
        ocr_chars: extraction.ocr_text.length,
        transcript_chars: extraction.transcript.length,
      },
    });

    return { id: evidenceId, job_status: "done", job_attempts: attempt, severity };
  } catch (e) {
    const message = (e as Error).message || "Extraction failed";
    await supabaseAdmin
      .from("media_evidence")
      .update({
        job_status: "failed",
        job_error: message,
        job_completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", evidenceId);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: row.uploader_id,
      event_type: "evidence.extraction_failed",
      object_type: "media_evidence",
      object_id: evidenceId,
      details: { attempt, error: message },
    });

    return { id: evidenceId, job_status: "failed", job_attempts: attempt, severity: "safe" };
  }
}
