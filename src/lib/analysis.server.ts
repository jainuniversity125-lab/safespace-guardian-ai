// Server-only: AI classification + policy risk aggregation. Never imported by client code.
import { CATEGORIES, type LabelScore, type Prediction, type Severity } from "./safety";

export const MODEL_VERSION = "safespace-gemini-3.5-flash-1.0.0";

const SYSTEM_PROMPT = `You are a strict, highly sensitive multilingual cyberbullying and safety detection AI used inside a human-in-the-loop content-safety platform.
You analyze text in ANY language (English, Hindi, Kannada, Tamil, Telugu, Hinglish, Kanglish, Spanish, French, German, and code-mixed text).

Your goal is to detect ALL cyberbullying, harassment, abuse, profanity, threats, doxxing, sexual harassment, and harsh or insulting sentences.

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

CRITICAL CLASSIFICATION RULES:
- If text contains ANY targeted insult, abusive word, profanity, or derogatory phrase (e.g., "idiot", "loser", "chutiya", "saala", "bolimaga", "bitch", "shut up", "useless", "mar jaa"), you MUST assign high probability to "harassment" or "insult_humiliation" or "profanity" (>= 0.8), set targeted_harassment_score >= 0.75, toxicity_score >= 0.8, and target_detected = true.
- If text contains violent threat ("kill", "die", "maar dunga", "saayi"), set threat_score >= 0.9 and label "threat_intimidation".
- If text contains self-harm encouragement ("kys", "mar jaa", "suicide"), set self_harm_encouragement_score >= 0.95 and label "self_harm_encouragement".
- Multi-label: a message can belong to multiple categories.
- Explanations must describe the observed pattern in clear language.`;

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
      .limit(10);

    if (!data?.length) return "";
    const rows = data as FewShotRow[];
    const formatted = rows
      .map(
        (r) =>
          `- Input (${r.language}): "${r.text}" -> Category: ${r.expected_category}, Bullying: ${r.expected_bullying}, Severity: ${r.expected_severity}`,
      )
      .join("\n");

    return `\n\nApproved classification examples:\n${formatted}\n`;
  } catch {
    return "";
  }
}

async function queryGeminiDirect(text: string, systemPrompt: string, apiKey: string): Promise<string> {
  const attempts = [
    { version: "v1beta", model: "gemini-2.5-flash" },
    { version: "v1beta", model: "gemini-2.0-flash" },
    { version: "v1", model: "gemini-1.5-flash" },
    { version: "v1beta", model: "gemini-1.5-flash" },
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
  if (/chutiya|saala|kamina|madarchod|bhenchod|gandu|harami|bhosdike|bhadwe|mar jaa/.test(lower)) {
    language = "hi";
  } else if (/sule|bolimaga|kariya|bevarsi|saayi|thullu|sooli|magane/.test(lower)) {
    language = "kn";
  } else if (/pundai|otha|thevidia|loosie|panni/.test(lower)) {
    language = "ta";
  } else if (/lanja|kodaka|dengey/.test(lower)) {
    language = "te";
  } else if (/puta|mierda|salope|connard|scheisse|arschloch/.test(lower)) {
    language = "es";
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

  // Violent Threats
  if (/kill|die|mardu|maar|beat|destroy|threat|hisaab|khoon|savadipen|saayi/.test(lower)) {
    labels.push({ name: "threat_intimidation", probability: 0.95 });
    threat_score = 0.95;
    toxicity_score = 0.9;
    target_detected = true;
    explanation.push("Detected violent threat keyword or statement");
    evidence_spans.push("threat keyword");
  }

  // Doxxing & Privacy Violation
  if (/leak|address|dox|phone|number|location|pincode|ip address|personal info/.test(lower)) {
    labels.push({ name: "doxxing", probability: 0.9 });
    doxxing_score = 0.9;
    toxicity_score = 0.8;
    target_detected = true;
    explanation.push("Potential private detail leakage or doxxing threat");
    evidence_spans.push("doxxing keyword");
  }

  // Sexual Harassment & Abuse
  if (/sexy|hot|nude|porn|send pic|nudes|bitch|slut|whore|pundai|thevidia|puta|salope/.test(lower)) {
    labels.push({ name: "sexual_harassment", probability: 0.9 });
    sexual_exploitation_score = 0.7;
    toxicity_score = 0.85;
    target_detected = true;
    explanation.push("Contains sexually explicit content, inappropriate requests, or sexual slurs");
    evidence_spans.push("sexual reference");
  }

  // Insults, Profanity, Abuse & Harassment in English, Hindi, Kannada, Tamil, Telugu, Spanish
  if (
    /stupid|idiot|loser|ugly|dumb|fool|useless|trash|garbage|hate you|shut up|get lost|bastard|asshole|fuck|shit|crap|chutiya|saala|kariya|bolimaga|madarchod|bhenchod|kamina|gandu|harami|bhosdike|bhadwe|randi|bevarsi|sule|panni|kodaka|lanja|mierda|connard|scheisse|arschloch/.test(lower)
  ) {
    labels.push({ name: "insult_humiliation", probability: 0.9 });
    labels.push({ name: "harassment", probability: 0.85 });
    targeted_harassment_score = 0.85;
    toxicity_score = 0.85;
    target_detected = true;
    explanation.push("Contains targeted insults, abusive words, profanity, or derogatory phrases");
    evidence_spans.push("insulting/abusive phrase");
  }

  // Self Harm Encouragement
  if (/suicide|cut yourself|kill yourself|kys|mar jaa|die alone|end your life/.test(lower)) {
    labels.push({ name: "self_harm_encouragement", probability: 0.98 });
    self_harm_encouragement_score = 0.98;
    toxicity_score = 0.95;
    target_detected = true;
    explanation.push("Encouragement of self-harm, suicide, or self-destruction");
    evidence_spans.push("self harm encouragement");
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
    confidence: 0.92,
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
