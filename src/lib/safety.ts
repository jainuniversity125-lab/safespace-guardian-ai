// Client-safe shared taxonomy, thresholds and helpers for the safety platform.

export const SEVERITIES = ["safe", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = [
  "insult_humiliation",
  "harassment",
  "threat_intimidation",
  "hate_identity_abuse",
  "sexual_harassment",
  "sexual_exploitation",
  "doxxing",
  "impersonation",
  "rumor_reputation_attack",
  "exclusion_pile_on",
  "stalking_repeated_contact",
  "self_harm_encouragement",
  "non_bullying",
  "ambiguous_needs_review",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  insult_humiliation: "Insult or humiliation",
  harassment: "Harassment",
  threat_intimidation: "Threat or intimidation",
  hate_identity_abuse: "Hate / identity-based abuse",
  sexual_harassment: "Sexual harassment",
  sexual_exploitation: "Sexual exploitation risk",
  doxxing: "Doxxing / personal info exposure",
  impersonation: "Impersonation",
  rumor_reputation_attack: "Rumour or reputation attack",
  exclusion_pile_on: "Exclusion or coordinated pile-on",
  stalking_repeated_contact: "Stalking / repeated contact",
  self_harm_encouragement: "Self-harm encouragement",
  non_bullying: "Non-bullying content",
  ambiguous_needs_review: "Ambiguous — needs human review",
};

export const SEVERITY_META: Record<Severity, { label: string; blurb: string; token: string }> = {
  safe: { label: "Safe", blurb: "No targeting detected", token: "safe" },
  low: { label: "Low", blurb: "Rude but limited targeting", token: "low" },
  medium: { label: "Medium", blurb: "Targeted or repeated abuse", token: "medium" },
  high: { label: "High", blurb: "Threats, doxxing, sexual abuse", token: "high" },
  critical: { label: "Critical", blurb: "Credible harm / child safety", token: "critical" },
};

export const REPORT_CATEGORIES = CATEGORIES.filter((c) => c !== "non_bullying");

export type LabelScore = { name: string; probability: number };

export type Prediction = {
  id?: string;
  model_version: string;
  labels: LabelScore[];
  severity: Severity;
  confidence: number;
  target_detected: boolean;
  repetition_score: number;
  final_risk: number;
  explanation: string[];
  recommended_action: string;
  requires_review: boolean;
};

export const ACTION_LABELS: Record<string, string> = {
  allow: "Allow",
  warn_author: "Warn author before posting",
  reduce_visibility: "Reduce distribution",
  moderator_queue: "Send to moderator queue",
  hide_and_escalate: "Hide content and escalate",
  urgent_human_review: "Urgent specialist review",
};

export function severityClasses(severity: Severity) {
  switch (severity) {
    case "critical":
      return "bg-critical/15 text-critical border-critical/40";
    case "high":
      return "bg-high/15 text-high border-high/40";
    case "medium":
      return "bg-medium/15 text-medium border-medium/40";
    case "low":
      return "bg-low/15 text-low border-low/40";
    default:
      return "bg-safe/15 text-safe border-safe/40";
  }
}

export function pct(n: number) {
  return `${Math.round((Number(n) || 0) * 100)}%`;
}
