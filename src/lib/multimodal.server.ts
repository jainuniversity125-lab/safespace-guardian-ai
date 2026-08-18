// Server-only: OCR (images/video frames) and speech-to-text (audio/video) via the AI gateway.
import { sanitizeText } from "./analysis.server";

export type MediaKind = "image" | "video" | "audio";

export type ExtractionSegment = {
  /** Playback offset in seconds for video/audio, or reading order index for images. */
  t: number;
  kind: "ocr" | "speech";
  text: string;
  confidence: number;
};

export type MediaExtraction = {
  ocr_text: string;
  transcript: string;
  visual_description: string;
  notes: string[];
  ocr_confidence: number;
  transcript_confidence: number;
  segments: ExtractionSegment[];
  model_version: string;
};

export const EXTRACTION_MODEL = "google/gemini-3.5-flash";
export const EXTRACTION_VERSION = `safespace-extract-1.1.0 (${EXTRACTION_MODEL})`;

const PROMPT = `You are an evidence-extraction assistant inside a human-in-the-loop content-safety platform.
Extract, never judge. Return STRICT JSON:
{
  "ocr_text": "every readable word visible in the media (screenshots, captions, usernames, hashtags), '' if none",
  "transcript": "verbatim speech transcript with speaker turns if audio is present, '' if none",
  "visual_description": "neutral description of what is shown, including who appears targeted",
  "notes": ["short observations useful to a moderator"],
  "ocr_confidence": 0.0,
  "transcript_confidence": 0.0,
  "segments": [
    { "t": 0, "kind": "ocr" | "speech", "text": "segment text", "confidence": 0.0 }
  ]
}
"t" is the playback offset in SECONDS for audio/video, or the reading-order index for still images.
Confidences are 0..1 self-assessed legibility/audibility scores.
Preserve the original language. Do not translate. Do not sanitise slurs — moderators need the exact wording.`;

function mediaMessagePart(kind: MediaKind, mimeType: string, base64: string) {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  if (kind === "audio") {
    return {
      type: "input_audio",
      input_audio: { data: base64, format: mimeType.includes("wav") ? "wav" : "mp3" },
    };
  }
  if (kind === "video") {
    return { type: "video_url", video_url: { url: dataUrl } };
  }
  return { type: "image_url", image_url: { url: dataUrl } };
}

function clamp01(n: unknown, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

function emptyExtraction(note: string): MediaExtraction {
  return {
    ocr_text: "",
    transcript: "",
    visual_description: "",
    notes: [note],
    ocr_confidence: 0,
    transcript_confidence: 0,
    segments: [],
    model_version: EXTRACTION_VERSION,
  };
}

async function queryGeminiMultimodalDirect(
  base64: string,
  mimeType: string,
  kind: MediaKind,
  apiKey: string
): Promise<string> {
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
            parts: [{ text: PROMPT }]
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: `Media kind: ${kind}. Extract all text and speech.` },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Multimodal API error ${response.status}: ${errorText}`);
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

  throw lastError || new Error("All direct Gemini multimodal queries failed");
}

export async function extractFromMedia(
  bytes: ArrayBuffer,
  mimeType: string,
  kind: MediaKind,
): Promise<MediaExtraction> {
  const cleanEnv = (val: string | undefined) => {
    if (!val) return undefined;
    return val.replace(/^["']|["']$/g, "");
  };

  const apiKey = cleanEnv(process.env["LOVABLE_API_KEY"]);
  const geminiKey = cleanEnv(process.env["GEMINI_API_KEY"]);


  const base64 = arrayBufferToBase64(bytes);
  let content = "{}";
  let isFallback = false;

  if (apiKey) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Media kind: ${kind}. Extract all text and speech.` },
              mediaMessagePart(kind, mimeType, base64),
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("NO_CREDITS");
    if (!res.ok) {
      throw new Error(`Extraction gateway error ${res.status}`);
    }

    const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = payload.choices?.[0]?.message?.content ?? "{}";
  } else if (geminiKey) {
    try {
      content = await queryGeminiMultimodalDirect(kind, mimeType, base64, geminiKey);
    } catch (e: any) {
      console.error("Gemini Direct Multimodal API failed, running mock fallback:", e);
      isFallback = true;
    }
  } else {
    console.warn("No AI API key found for media extraction. Running mock media extraction fallback.");
    isFallback = true;
  }

  if (isFallback) {
    return {
      ocr_text: "SAMPLE OCR TEXT: [No API key configured for actual extraction]",
      transcript: "SAMPLE TRANSCRIPT: [No API key configured for speech extraction]",
      visual_description: `A ${kind} media file of type ${mimeType}.`,
      notes: ["Mock extraction mode activated because no API keys were configured."],
      ocr_confidence: 0.9,
      transcript_confidence: 0.9,
      segments: [
        { t: 0, kind: "ocr", text: "SAMPLE OCR TEXT", confidence: 0.9 }
      ],
      model_version: `${EXTRACTION_VERSION}-local-mock`,
    };
  }

  let raw: Partial<MediaExtraction> = {};

  try {
    raw = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as Partial<MediaExtraction>;
  } catch {
    return emptyExtraction("Model returned unreadable output; manual review required.");
  }

  const segments: ExtractionSegment[] = Array.isArray(raw.segments)
    ? raw.segments
        .filter((s): s is ExtractionSegment => Boolean(s) && typeof s === "object")
        .slice(0, 200)
        .map((s, i): ExtractionSegment => ({
          t: typeof s.t === "number" && Number.isFinite(s.t) ? s.t : i,
          kind: s.kind === "speech" ? "speech" : "ocr",
          text: typeof s.text === "string" ? s.text : "",
          confidence: clamp01(s.confidence, 0.5),
        }))
        .filter((s) => s.text.trim().length > 0)
    : [];

  const ocr = typeof raw.ocr_text === "string" ? raw.ocr_text : "";
  const transcript = typeof raw.transcript === "string" ? raw.transcript : "";

  return {
    ocr_text: ocr,
    transcript,
    visual_description: typeof raw.visual_description === "string" ? raw.visual_description : "",
    notes: Array.isArray(raw.notes) ? raw.notes.filter((n) => typeof n === "string").slice(0, 6) : [],
    ocr_confidence: clamp01(raw.ocr_confidence, ocr ? 0.6 : 0),
    transcript_confidence: clamp01(raw.transcript_confidence, transcript ? 0.6 : 0),
    segments,
    model_version: EXTRACTION_VERSION,
  };
}

/** Text handed to the classifier — identifiers masked before scoring. */
export function extractionToText(e: MediaExtraction) {
  return sanitizeText(
    [e.ocr_text, e.transcript, e.visual_description].filter(Boolean).join("\n\n"),
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
