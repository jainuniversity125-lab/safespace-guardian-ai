// Server-only: AI classification + policy risk aggregation. Never imported by client code.
import { CATEGORIES, type LabelScore, type Prediction, type Severity } from "./safety";

export const MODEL_VERSION = "safespace-gemini-3.5-flash-1.0.0";

const SYSTEM_PROMPT = `You are a multilingual cyberbullying detection model used inside a human-in-the-loop
content-safety platform (English, Hindi, Kannada and code-mixed text included).
You NEVER make enforcement decisions; you only score content.

Return STRICT JSON with this shape:
{
  "language": "ISO 639-1 code",
  "labels": [{"name": "<category>", "probability": 0..1}],
  "target_detected": boolean,
  "quoting_or_condemning": boolean,
  "threat_score": 0..1,
  "doxxing_score": 0..1,
  "sexual_exploitation_score": 0..1,
  "self_harm_encouragement_score": 0..1,
  "targeted_harassment_score": 0..1,
  "toxicity_score": 0..1,
  "confidence": 0..1,
  "explanation": ["short evidence phrase", "..."],
  "evidence_spans": ["exact substring from the input", "..."]
}

Allowed category names: ${CATEGORIES.join(", ")}.
Rules:
- Multi-label: a message can belong to several categories.
- Sarcasm, reclaimed slurs, quoting abuse in order to condemn it, and in-group banter are NOT bullying;
  set quoting_or_condemning true and lower probabilities, but keep confidence honest.
- If the meaning is genuinely unclear, include "ambiguous_needs_review" with a high probability and
  keep confidence below 0.6 instead of guessing.
- Explanations must describe the observed pattern in plain language; never claim certainty.`;

type RawAnalysis = {
  language?: string;
  labels?: LabelScore[];
  target_detected?: boolean;
  quoting_or_condemning?: boolean;
  threat_score?: number;
  doxxing_score?: number;
  sexual_exploitation_score?: number;
  self_harm_encouragement_score?: number;
  targeted_harassment_score?: number;
  toxicity_score?: number;
  confidence?: number;
  explanation?: string[];
  evidence_spans?: string[];
};

export type ContextSignals = {
  senderRecentMessages: number;
  messagesToSameTarget: number;
  priorConfirmedIncidents: number;
  targetHasBlockedSender: boolean;
};

export type AnalysisResult = Prediction & {
  language: string;
  evidence_spans: string[];
  context_score: number;
  quoting_or_condemning: boolean;
};

const num = (v: unknown, fallback = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
};

/** Masks direct identifiers before the text ever reaches the model. */
export function sanitizeText(input: string) {
  return input
    .normalize("NFKC")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[EMAIL]")
    .replace(/\b(?:\+?\d[\d\s-]{8,}\d)\b/g, "[PHONE]")
    .replace(/https?:\/\/\S+/g, "[URL]")
    .trim();
}

type FewShotRow = {
  text: string;
  language: string;
  script_mix: string;
  expected_category: string;
  expected_bullying: boolean;
  expected_severity: string;
  rationale: string | null;
};

/**
 * Curated, human-approved examples (mostly code-mixed Kannada/Hindi) are injected
 * into the prompt. This is "tuning without fine-tuning": the hosted model cannot be
 * retrained, but grounded in-context examples measurably shift its decisions.
 */
export async function loadFewShotBlock(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("fewshot_examples")
      .select("text, language, script_mix, expected_category, expected_bullying, expected_severity, rationale")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(24);
    const rows = (data ?? []) as FewShotRow[];
    if (rows.length === 0) return "";
    const lines = rows.map(
      (r) =>
        `- (${r.language}/${r.script_mix}) "${sanitizeText(r.text).slice(0, 220)}" -> bullying=${r.expected_bullying}, category=${r.expected_category}, severity=${r.expected_severity}${r.rationale ? ` — ${r.rationale}` : ""}`,
    );
    return `\n\nHuman-verified regional examples (Indian languages, including code-mixed Kannada/Hindi in Latin script). Follow the reasoning pattern they encode, do not copy their wording:\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

async function queryGeminiDirect(text: string, systemPrompt: string, apiKey: string): Promise<string> {
  const attempts = [
    { version: "v1beta", model: "gemini-3.6-flash" },
    { version: "v1", model: "gemini-1.5-flash" },
    { version: "v1beta", model: "gemini-1.5-flash" },
    { version: "v1beta", model: "gemini-1.5-flash-latest" },
  ];
  let lastError: Error | null = null;
  
  for (const attempt of attempts) {
    try {
      const url = `https://generativelanguage.googleapis.com/${attempt.version}/models/${attempt.model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: text }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error("Invalid response structure from Gemini API");
      }
      return content;
    } catch (err: any) {
      console.warn(`Direct query failed for model ${attempt.model} (${attempt.version}):`, err.message);
      lastError = err;
    }
  }
  
  throw lastError || new Error("All direct Gemini model queries failed");
}

function runLocalFallback(text: string): string {
  const lower = text.toLowerCase();
  
  let language = "en";
  if (lower.includes("saala") || lower.includes("chutiya") || lower.includes("kamina")) {
    language = "hi";
  } else if (lower.includes("sule") || lower.includes("boli") || lower.includes("kalla") || lower.includes("kariya")) {
    language = "kn";
  }

  const labels: Array<{ name: string; probability: number }> = [];
  let target_detected = false;
  let threat_score = 0.0;
  let doxxing_score = 0.0;
  let sexual_exploitation_score = 0.0;
  let self_harm_encouragement_score = 0.0;
  let targeted_harassment_score = 0.0;
  let toxicity_score = 0.0;
  const explanation: string[] = [];
  const evidence_spans: string[] = [];

  if (lower.includes("kill") || lower.includes("die") || lower.includes("mardu") || lower.includes("threat") || lower.includes("maar")) {
    labels.push({ name: "threat_intimidation", probability: 0.92 });
    threat_score = 0.9;
    toxicity_score = 0.85;
    target_detected = true;
    explanation.push("Detected violent threat keyword ('kill' or 'die')");
    evidence_spans.push(lower.includes("kill") ? "kill" : lower.includes("die") ? "die" : "threat");
  }

  if (lower.includes("leak") || lower.includes("address") || lower.includes("dox") || lower.includes("phone") || lower.includes("personal info")) {
    labels.push({ name: "doxxing", probability: 0.88 });
    doxxing_score = 0.85;
    toxicity_score = 0.7;
    target_detected = true;
    explanation.push("Potential leakage of private details / doxxing attempt");
    evidence_spans.push(lower.includes("leak") ? "leak" : "address");
  }

  if (lower.includes("sexy") || lower.includes("hot") || lower.includes("nude") || lower.includes("porn")) {
    labels.push({ name: "sexual_harassment", probability: 0.85 });
    sexual_exploitation_score = 0.4;
    toxicity_score = 0.75;
    target_detected = true;
    explanation.push("Contains sexually explicit content or inappropriate requests");
    evidence_spans.push("sexual reference");
  }

  if (
    lower.includes("stupid") || lower.includes("idiot") || lower.includes("loser") || lower.includes("ugly") ||
    lower.includes("chutiya") || lower.includes("saala") || lower.includes("kariya") || lower.includes("bolimaga")
  ) {
    labels.push({ name: "insult_humiliation", probability: 0.85 });
    targeted_harassment_score = 0.6;
    toxicity_score = 0.8;
    target_detected = true;
    explanation.push("Contains targeted insults or derogatory words");
    evidence_spans.push("insulting term");
  }

  if (lower.includes("suicide") || lower.includes("cut yourself") || lower.includes("kill yourself") || lower.includes("kys")) {
    labels.push({ name: "self_harm_encouragement", probability: 0.95 });
    self_harm_encouragement_score = 0.95;
    toxicity_score = 0.9;
    target_detected = true;
    explanation.push("Encouragement of self-harm or suicide");
    evidence_spans.push("suicide encouragement");
  }

  if (labels.length === 0) {
    labels.push({ name: "non_bullying", probability: 0.95 });
    explanation.push("No indicators of cyberbullying or policy violations found");
  }

  const rawJson = {
    language,
    labels,
    target_detected,
    quoting_or_condemning: false,
    threat_score,
    doxxing_score,
    sexual_exploitation_score,
    self_harm_encouragement_score,
    targeted_harassment_score,
    toxicity_score,
    confidence: 0.9,
    explanation,
    evidence_spans
  };

  return JSON.stringify(rawJson);
}

export async function classifyText(
  originalText: string,
  ctx: ContextSignals,
  opts: { fewShot?: boolean } = {},
): Promise<AnalysisResult> {
  const cleanEnv = (val: string | undefined) => {
    if (!val) return undefined;
    return val.replace(/^["']|["']$/g, "");
  };

  const apiKey = cleanEnv(process.env["LOVABLE_API_KEY"]);
  const geminiKey = cleanEnv(process.env["GEMINI_API_KEY"]);
  const sanitized = sanitizeText(originalText);
  const useFewShot = opts.fewShot !== false;
  const fewShotBlock = useFewShot ? await loadFewShotBlock() : "";
  const fullSystemPrompt = SYSTEM_PROMPT + fewShotBlock;

  let content = "{}";
  let isFallback = false;

  if (apiKey) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: fullSystemPrompt },
          {
            role: "user",
            content: `Conversation context signals: ${JSON.stringify(ctx)}\n\nMessage to analyse:\n"""${sanitized}"""`,
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("NO_CREDITS");
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);

    const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = payload.choices?.[0]?.message?.content ?? "{}";
  } else if (geminiKey) {
    try {
      content = await queryGeminiDirect(
        `Conversation context signals: ${JSON.stringify(ctx)}\n\nMessage to analyse:\n"""${sanitized}"""`,
        fullSystemPrompt,
        geminiKey
      );
    } catch (e: any) {
      console.error("Gemini Direct API failed, running local fallback:", e);
      content = runLocalFallback(sanitized);
      isFallback = true;
    }
  } else {
    console.warn("No AI API key found (LOVABLE_API_KEY or GEMINI_API_KEY). Running local fallback classifier.");
    content = runLocalFallback(sanitized);
    isFallback = true;
  }

  let raw: RawAnalysis = {};
  try {
    raw = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as RawAnalysis;
  } catch {
    raw = {};
  }

  const result = aggregate(raw, ctx);
  const version = isFallback ? `${result.model_version}-local-fallback` : result.model_version;
  return fewShotBlock
    ? { ...result, model_version: `${version}+fewshot` }
    : { ...result, model_version: version };
}


/** Rule-based risk aggregation + policy engine (thresholds are tunable starting points). */
export function aggregate(raw: RawAnalysis, ctx: ContextSignals): AnalysisResult {
  const labels: LabelScore[] = (raw.labels ?? [])
    .filter((l) => l && typeof l.name === "string")
    .map((l) => ({ name: l.name, probability: num(l.probability) }))
    .filter((l) => (CATEGORIES as readonly string[]).includes(l.name))
    .sort((a, b) => b.probability - a.probability);

  const byName = (n: string) => labels.find((l) => l.name === n)?.probability ?? 0;

  const textScore = Math.max(
    num(raw.toxicity_score),
    ...labels.filter((l) => l.name !== "non_bullying").map((l) => l.probability),
    0,
  );

  const repetition = Math.min(
    1,
    ctx.messagesToSameTarget / 5 + ctx.priorConfirmedIncidents * 0.2,
  );
  const contextScore = Math.min(
    1,
    (ctx.targetHasBlockedSender ? 0.4 : 0) +
      Math.min(0.4, ctx.senderRecentMessages / 20) +
      Math.min(0.4, ctx.priorConfirmedIncidents * 0.2),
  );
  const threat = Math.max(num(raw.threat_score), byName("threat_intimidation"));
  const doxxing = Math.max(num(raw.doxxing_score), byName("doxxing"));
  const exploitation = Math.max(
    num(raw.sexual_exploitation_score),
    byName("sexual_exploitation"),
  );
  const selfHarm = Math.max(
    num(raw.self_harm_encouragement_score),
    byName("self_harm_encouragement"),
  );
  const targeted = Math.max(num(raw.targeted_harassment_score), byName("harassment"));
  const safetyScore = Math.max(threat, doxxing, exploitation, selfHarm);

  const finalRisk = Math.min(
    1,
    0.45 * textScore + 0.2 * contextScore + 0.15 * repetition + 0.1 * 0 + 0.1 * safetyScore,
  );

  let severity: Severity = "safe";
  let action = "allow";

  if (threat >= 0.8 || selfHarm >= 0.7) {
    severity = "critical";
    action = "urgent_human_review";
  } else if (doxxing >= 0.75 || exploitation >= 0.75) {
    severity = "high";
    action = "hide_and_escalate";
  } else if (targeted >= 0.7 || finalRisk >= 0.7) {
    severity = "medium";
    action = "moderator_queue";
  } else if (finalRisk >= 0.35 || textScore >= 0.45) {
    severity = "low";
    action = "warn_author";
  }

  const confidence = num(raw.confidence, 0.5);
  const ambiguous =
    byName("ambiguous_needs_review") >= 0.5 || (confidence < 0.6 && severity !== "safe");
  const requiresReview =
    ambiguous || severity === "critical" || severity === "high" || severity === "medium";

  const explanation = (raw.explanation ?? []).filter((e) => typeof e === "string").slice(0, 6);
  if (raw.quoting_or_condemning) explanation.push("Appears to quote or condemn abuse, not commit it");
  if (repetition > 0.5) explanation.push("Repeated messages directed at the same person");
  if (ctx.targetHasBlockedSender) explanation.push("Recipient has previously blocked this sender");

  return {
    model_version: MODEL_VERSION,
    language: raw.language ?? "unknown",
    labels: labels.length ? labels : [{ name: "non_bullying", probability: 0.9 }],
    severity,
    confidence,
    target_detected: Boolean(raw.target_detected),
    repetition_score: repetition,
    context_score: contextScore,
    final_risk: finalRisk,
    explanation,
    evidence_spans: (raw.evidence_spans ?? []).filter((s) => typeof s === "string").slice(0, 8),
    recommended_action: action,
    requires_review: requiresReview,
    quoting_or_condemning: Boolean(raw.quoting_or_condemning),
  };
}
