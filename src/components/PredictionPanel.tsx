import { CATEGORY_LABELS, SEVERITY_META, pct, severityClasses, type Severity } from "@/lib/safety";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.safe;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        severityClasses(severity),
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

type PredictionLike = {
  model_version: string;
  labels: { name: string; probability: number }[];
  severity: Severity;
  confidence: number;
  final_risk: number;
  repetition_score: number;
  target_detected: boolean;
  explanation: string[];
  recommended_action: string;
  requires_review: boolean;
};

export function PredictionPanel({ p }: { p: PredictionLike }) {
  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <SeverityBadge severity={p.severity} />
        <span className="text-xs text-muted-foreground">
          confidence {pct(p.confidence)} · risk {pct(p.final_risk)} · {p.model_version}
        </span>
        {p.requires_review && (
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
            Human review required
          </span>
        )}
      </div>

      <div className="space-y-2">
        {p.labels.slice(0, 5).map((l) => (
          <div key={l.name} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{CATEGORY_LABELS[l.name] ?? l.name}</span>
              <span className="text-muted-foreground">{pct(l.probability)}</span>
            </div>
            <Progress value={l.probability * 100} className="h-1.5" />
          </div>
        ))}
      </div>

      {p.explanation.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Why this was flagged
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-sm">
            {p.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Target detected: {p.target_detected ? "yes" : "no"}</span>
        <span>Repetition: {pct(p.repetition_score)}</span>
        <span>Recommended: {p.recommended_action.replaceAll("_", " ")}</span>
      </div>
    </div>
  );
}
