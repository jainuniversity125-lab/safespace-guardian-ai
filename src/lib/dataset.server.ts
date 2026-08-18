// Server-only: dataset parsing + the benchmark runner used by the evaluation lab.
import { classifyText } from "./analysis.server";
import { CATEGORIES, SEVERITIES, type Severity } from "./safety";

export type ParsedSample = {
  text: string;
  language: string;
  script_mix: string;
  expected_bullying: boolean;
  expected_category: string;
  expected_severity: string;
  notes: string | null;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const truthy = (v: unknown) =>
  typeof v === "boolean" ? v : ["true", "1", "yes", "bullying", "abusive"].includes(String(v).toLowerCase());

function normalize(raw: Record<string, unknown>): ParsedSample | null {
  const text = String(raw["text"] ?? raw["content"] ?? raw["message"] ?? "").trim();
  if (!text) return null;
  const category = String(raw["expected_category"] ?? raw["category"] ?? raw["label"] ?? "").trim();
  const severity = String(raw["expected_severity"] ?? raw["severity"] ?? "").trim().toLowerCase();
  const bullyingRaw = raw["expected_bullying"] ?? raw["bullying"] ?? raw["is_bullying"];
  const bullying =
    bullyingRaw === undefined ? category !== "" && category !== "non_bullying" : truthy(bullyingRaw);
  return {
    text: text.slice(0, 2000),
    language: String(raw["language"] ?? raw["lang"] ?? "unknown").trim().toLowerCase() || "unknown",
    script_mix: String(raw["script_mix"] ?? raw["script"] ?? "native").trim().toLowerCase() || "native",
    expected_bullying: bullying,
    expected_category: (CATEGORIES as readonly string[]).includes(category)
      ? category
      : bullying
        ? "harassment"
        : "non_bullying",
    expected_severity: (SEVERITIES as readonly string[]).includes(severity)
      ? severity
      : bullying
        ? "medium"
        : "safe",
    notes: raw["notes"] ? String(raw["notes"]).slice(0, 500) : null,
  };
}

/** Accepts CSV (with header row), JSON array or JSONL. */
export function parseDataset(input: string): ParsedSample[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as Record<string, unknown>[];
    return arr.map(normalize).filter((s): s is ParsedSample => s !== null);
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines[0]?.trim().startsWith("{")) {
    return lines
      .map((l) => normalize(JSON.parse(l) as Record<string, unknown>))
      .filter((s): s is ParsedSample => s !== null);
  }

  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  return lines
    .slice(1)
    .map((line) => {
      const cells = splitCsvLine(line);
      const row: Record<string, unknown> = {};
      header.forEach((h, i) => {
        row[h] = cells[i] ?? "";
      });
      return normalize(row);
    })
    .filter((s): s is ParsedSample => s !== null);
}

export type LanguageMetric = {
  key: string;
  total: number;
  correct: number;
  accuracy: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
};

function metricsFor(
  rows: Array<{ expected_bullying: boolean; predicted_bullying: boolean }>,
  key: string,
): LanguageMetric {
  const total = rows.length;
  const tp = rows.filter((r) => r.expected_bullying && r.predicted_bullying).length;
  const fp = rows.filter((r) => !r.expected_bullying && r.predicted_bullying).length;
  const fn = rows.filter((r) => r.expected_bullying && !r.predicted_bullying).length;
  const correct = rows.filter((r) => r.expected_bullying === r.predicted_bullying).length;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return {
    key,
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    truePositive: tp,
    falsePositive: fp,
    falseNegative: fn,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
  };
}

const CONCURRENCY = 4;

/**
 * Scores every sample in a dataset with the live detector and stores per-sample
 * results plus per-language metrics. `mode` decides whether the human-approved
 * few-shot examples are injected ("tuned") or not ("baseline").
 */
export async function runBenchmarkJob(runId: string, mode: "baseline" | "tuned", limit: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: run } = await supabaseAdmin
    .from("benchmark_runs")
    .select("id, dataset_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run) throw new Error("Benchmark run not found");

  const { data: samples } = await supabaseAdmin
    .from("dataset_samples")
    .select("id, text, language, script_mix, expected_bullying, expected_category, expected_severity")
    .eq("dataset_id", run.dataset_id)
    .limit(limit);

  const list = samples ?? [];
  if (list.length === 0) throw new Error("Dataset has no samples");

  const rows: Array<{
    run_id: string;
    sample_id: string;
    language: string;
    script_mix: string;
    text_preview: string;
    expected_bullying: boolean;
    expected_category: string;
    predicted_bullying: boolean;
    predicted_category: string;
    predicted_severity: Severity;
    confidence: number;
    final_risk: number;
    correct: boolean;
  }> = [];
  let modelVersion = "unknown";

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (s) => {
        try {
          const a = await classifyText(
            s.text,
            {
              senderRecentMessages: 0,
              messagesToSameTarget: 0,
              priorConfirmedIncidents: 0,
              targetHasBlockedSender: false,
            },
            { fewShot: mode === "tuned" },
          );
          return { s, a };
        } catch {
          return { s, a: null };
        }
      }),
    );

    for (const { s, a } of settled) {
      if (!a) continue;
      modelVersion = a.model_version;
      const top = a.labels.find((l) => l.name !== "non_bullying");
      const predictedBullying = a.severity !== "safe";
      rows.push({
        run_id: runId,
        sample_id: s.id,
        language: s.language,
        script_mix: s.script_mix,
        text_preview: s.text.slice(0, 160),
        expected_bullying: s.expected_bullying,
        expected_category: s.expected_category,
        predicted_bullying: predictedBullying,
        predicted_category: predictedBullying ? (top?.name ?? "harassment") : "non_bullying",
        predicted_severity: a.severity,
        confidence: a.confidence,
        final_risk: a.final_risk,
        correct: s.expected_bullying === predictedBullying,
      });
    }
  }

  if (rows.length > 0) {
    await supabaseAdmin.from("benchmark_results").insert(rows);
  }

  const groupKey = (r: (typeof rows)[number]) =>
    r.script_mix === "code_mixed" || r.script_mix === "romanized"
      ? `${r.language}-${r.script_mix}`
      : r.language;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = groupKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const metrics = {
    overall: metricsFor(rows, "overall"),
    byLanguage: [...groups.entries()]
      .map(([k, v]) => metricsFor(v, k))
      .sort((a, b) => b.total - a.total),
    scored: rows.length,
    skipped: list.length - rows.length,
  };

  await supabaseAdmin
    .from("benchmark_runs")
    .update({
      status: "done",
      metrics,
      model_version: modelVersion,
      sample_size: rows.length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return metrics;
}
