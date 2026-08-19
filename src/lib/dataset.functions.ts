import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseDataset, runBenchmarkJob } from "./dataset.server";
import { classifyText, sanitizeText } from "./analysis.server";
import type { Severity } from "./safety";

// Zod schemas for validation
const CreateDatasetInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sourceNote: z.string().max(500).optional(),
  csvText: z.string().min(1),
});

const RunBenchmarkInput = z.object({
  datasetId: z.string().uuid(),
  mode: z.enum(["baseline", "tuned"]),
  limit: z.number().int().min(1).max(200).default(50),
});

const FewshotInput = z.object({
  text: z.string().min(1).max(1000),
  language: z.string().min(2).max(10).default("en"),
  scriptMix: z.string().min(3).max(40).default("native"),
  expectedCategory: z.string().min(2).max(50),
  expectedBullying: z.boolean(),
  expectedSeverity: z.enum(["safe", "low", "medium", "high", "critical"]),
  rationale: z.string().max(1000).optional(),
});

const IngestSourceInput = z.object({
  name: z.string().min(1).max(200),
  platform: z.string().min(2).max(50).default("custom"),
});

const SimulatePostInput = z.object({
  sourceId: z.string().uuid(),
  authorHandle: z.string().min(1).max(100),
  targetHandle: z.string().max(100).optional(),
  body: z.string().min(1).max(2000),
  externalId: z.string().max(100).optional(),
});

/** Helper to assert that user is data scientist or admin */
async function requireLabAccess(supabase: any, userId: string) {
  const { data: isLab } = await supabase.rpc("is_lab", { _user_id: userId });
  if (!isLab) {
    throw new Error("Forbidden: Data Scientist or Admin role required");
  }
}

/** Parses CSV/JSON data and uploads a new dataset. */
export const createDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateDatasetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireLabAccess(supabase, userId);

    const parsed = parseDataset(data.csvText);
    if (parsed.length === 0) {
      throw new Error("Could not parse any valid samples from the input. Make sure to have a header row with 'text', 'category', 'bullying', etc.");
    }

    const { data: dataset, error: dsErr } = await supabase
      .from("datasets")
      .insert({
        owner_id: userId,
        name: data.name,
        description: data.description ?? null,
        source_note: data.sourceNote ?? null,
        sample_count: parsed.length,
        languages: Array.from(new Set(parsed.map(p => p.language))),
      })
      .select("id")
      .single();

    if (dsErr) throw new Error(dsErr.message);

    // Insert samples in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
      const batch = parsed.slice(i, i + BATCH_SIZE).map((s) => ({
        dataset_id: dataset.id,
        text: s.text,
        language: s.language,
        script_mix: s.script_mix,
        expected_bullying: s.expected_bullying,
        expected_category: s.expected_category,
        expected_severity: s.expected_severity as any,
        notes: s.notes,
      }));
      const { error: sErr } = await supabase.from("dataset_samples").insert(batch);
      if (sErr) throw new Error(sErr.message);
    }

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "dataset.created",
      object_type: "dataset",
      object_id: dataset.id,
      details: { name: data.name, samplesCount: parsed.length },
    });

    return { id: dataset.id, sampleCount: parsed.length };
  });

/** Runs a baseline or tuned benchmark job on a dataset. */
export const runBenchmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RunBenchmarkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireLabAccess(supabase, userId);

    const { data: run, error: runErr } = await supabase
      .from("benchmark_runs")
      .insert({
        dataset_id: data.datasetId,
        created_by: userId,
        mode: data.mode,
        status: "running",
        sample_size: 0,
      })
      .select("id")
      .single();

    if (runErr) throw new Error(runErr.message);

    try {
      const metrics = await runBenchmarkJob(run.id, data.mode, data.limit);
      
      await supabase.from("audit_logs").insert({
        actor_id: userId,
        event_type: "benchmark.run_completed",
        object_type: "benchmark_run",
        object_id: run.id,
        details: { mode: data.mode, dataset_id: data.datasetId, accuracy: metrics.overall.accuracy },
      });

      return { runId: run.id, metrics };
    } catch (e: any) {
      await supabase
        .from("benchmark_runs")
        .update({ status: "failed", error: e.message })
        .eq("id", run.id);
      throw e;
    }
  });

/** Fetch datasets with run summaries. */
export const getDatasets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireLabAccess(supabase, userId);

    const { data, error } = await supabase
      .from("datasets")
      .select("id, name, description, source_note, languages, sample_count, created_at, benchmark_runs(id, mode, status, metrics, created_at)")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Add a fewshot tuning example. */
export const addFewshotExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FewshotInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireLabAccess(supabase, userId);

    const { data: row, error } = await supabase
      .from("fewshot_examples")
      .insert({
        created_by: userId,
        text: data.text,
        language: data.language,
        script_mix: data.scriptMix,
        expected_category: data.expectedCategory,
        expected_bullying: data.expectedBullying,
        expected_severity: data.expectedSeverity,
        rationale: data.rationale ?? null,
        active: true,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "fewshot.added",
      object_type: "fewshot_example",
      object_id: row.id,
      details: { language: data.language, expected_category: data.expectedCategory },
    });

    return row;
  });

/** Toggles an example between active / inactive. */
export const toggleFewshotExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireLabAccess(supabase, userId);

    const { error } = await supabase
      .from("fewshot_examples")
      .update({ active: data.active })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: data.active ? "fewshot.activated" : "fewshot.deactivated",
      object_type: "fewshot_example",
      object_id: data.id,
      details: {},
    });

    return { ok: true };
  });

/** Deletes a fewshot example. */
export const deleteFewshotExample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireLabAccess(supabase, userId);

    const { error } = await supabase.from("fewshot_examples").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "fewshot.deleted",
      object_type: "fewshot_example",
      object_id: data.id,
      details: {},
    });

    return { ok: true };
  });

/** Create an external platform ingestion source. */
export const createIngestSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IngestSourceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const secret = "sig_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const { data: source, error } = await supabase
      .from("ingest_sources")
      .insert({
        created_by: userId,
        name: data.name,
        platform: data.platform,
        signing_secret: secret,
        active: true,
      })
      .select("id, name, platform, signing_secret")
      .single();

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      event_type: "ingest_source.created",
      object_type: "ingest_source",
      object_id: source.id,
      details: { platform: data.platform, name: data.name },
    });

    return source;
  });

/** Simulates real-time push ingestion from an external source (runs the AI model, scores and saves). */
export const simulateIngestedPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SimulatePostInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let client = supabase;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (supabaseAdmin) client = supabaseAdmin as any;
    } catch {
      // Fallback to context user client
    }

    const { data: source, error: srcErr } = await client
      .from("ingest_sources")
      .select("id, name, platform, event_count")
      .eq("id", data.sourceId)
      .maybeSingle();

    if (srcErr) throw new Error(srcErr.message);
    if (!source) throw new Error("Ingestion source not found");

    const analysis = await classifyText(data.body, {
      senderRecentMessages: 0,
      messagesToSameTarget: 0,
      priorConfirmedIncidents: 0,
      targetHasBlockedSender: false,
    });

    const { data: post, error: postErr } = await client
      .from("ingested_posts")
      .insert({
        source_id: source.id,
        platform: source.platform,
        external_id: data.externalId ?? `ext_${Math.random().toString(36).substring(2, 9)}`,
        author_handle: data.authorHandle,
        target_handle: data.targetHandle ?? null,
        body: sanitizeText(data.body),
        language: analysis.language,
        labels: analysis.labels as any,
        explanation: analysis.explanation as any,
        severity: analysis.severity as any,
        confidence: analysis.confidence,
        final_risk: analysis.final_risk,
        recommended_action: analysis.recommended_action,
        requires_review: analysis.requires_review,
        status: "new",
        model_version: analysis.model_version,
      })
      .select("*")
      .single();

    if (postErr) throw new Error(postErr.message);

    await client
      .from("ingest_sources")
      .update({
        event_count: (source.event_count ?? 0) + 1,
        last_event_at: new Date().toISOString(),
      })
      .eq("id", source.id);

    try {
      await client.from("audit_logs").insert({
        actor_id: userId,
        event_type: "ingest.post_ingested",
        object_type: "ingested_post",
        object_id: post.id,
        details: { platform: source.platform, severity: analysis.severity },
      });
    } catch {}

    if (analysis.requires_review) {
      const { data: contentItem, error: contentErr } = await client
        .from("content_items")
        .insert({
          author_id: userId,
          body: `[Ingested from ${source.platform} - Author: @${data.authorHandle}] ${sanitizeText(data.body)}`,
          language: analysis.language,
          visibility_status: "hidden",
          severity: analysis.severity as any,
          requires_review: true,
        })
        .select("id")
        .single();
      
      if (!contentErr && contentItem) {
        try {
          await client.from("model_predictions").insert({
            content_id: contentItem.id,
            model_version: analysis.model_version,
            labels: analysis.labels,
            severity: analysis.severity as any,
            confidence: analysis.confidence,
            target_detected: analysis.target_detected,
            repetition_score: analysis.repetition_score,
            final_risk: analysis.final_risk,
            explanation: analysis.explanation,
            recommended_action: analysis.recommended_action,
            requires_review: true,
          });
        } catch {}

        try {
          await client.from("notifications").insert({
            audience: "staff",
            kind: "new_flag",
            severity: analysis.severity as any,
            title: `New flagged ingestion from ${source.name}`,
            object_type: "content",
            object_id: contentItem.id,
          });
        } catch {}
      }
    }

    return post;
  });
