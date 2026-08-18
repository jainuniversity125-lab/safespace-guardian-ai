import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileVideo, Image as ImageIcon, Loader2, Mic, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SeverityBadge } from "@/components/PredictionPanel";
import { getEvidenceUrl, retryEvidenceExtraction, reviewEvidence } from "@/lib/evidence.functions";
import type { Severity } from "@/lib/safety";

export type EvidenceRow = {
  id: string;
  media_kind: string;
  mime_type: string;
  ocr_text: string | null;
  transcript: string | null;
  analysis: unknown;
  severity: string;
  status: string;
  legal_hold: boolean;
  created_at: string;
  job_status: string;
  job_attempts: number;
  job_error: string | null;
  duration_ms: number | null;
  ocr_confidence: number | null;
  transcript_confidence: number | null;
  segments: unknown;
  model_version: string | null;
};

type Segment = { t: number; kind: "ocr" | "speech"; text: string; confidence: number };

function stamp(t: number, kind: string) {
  if (kind === "image") return `#${Math.round(t)}`;
  const total = Math.max(0, Math.round(t));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function pct(n: number | null | undefined) {
  return Math.round((n ?? 0) * 100);
}

function JobBadge({ row }: { row: EvidenceRow }) {
  const tone =
    row.job_status === "done"
      ? "border-safe/50 bg-safe/10 text-safe"
      : row.job_status === "failed"
        ? "border-destructive/50 bg-destructive/10 text-destructive"
        : "border-primary/40 bg-primary/10 text-primary";
  const label =
    row.job_status === "processing"
      ? "extracting…"
      : row.job_status === "queued"
        ? "queued"
        : row.job_status;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${tone}`}>
      {(row.job_status === "processing" || row.job_status === "queued") && (
        <Loader2 className="size-3 animate-spin" />
      )}
      {label}
      {row.job_attempts > 1 && ` · try ${row.job_attempts}`}
    </span>
  );
}

function Column({
  title,
  confidence,
  text,
  segments,
  mediaKind,
  emptyLabel,
}: {
  title: string;
  confidence: number | null;
  text: string | null;
  segments: Segment[];
  mediaKind: string;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <span className="text-[11px] text-muted-foreground">confidence {pct(confidence)}%</span>
      </div>
      <Progress value={pct(confidence)} className="h-1" />
      {segments.length > 0 ? (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
          {segments.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {stamp(s.t, mediaKind)}
              </span>
              <span className="flex-1 whitespace-pre-wrap">{s.text}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {pct(s.confidence)}%
              </span>
            </li>
          ))}
        </ul>
      ) : text ? (
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">{text}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

export function EvidenceViewer({
  row,
  staff = false,
  queryKey,
}: {
  row: EvidenceRow;
  staff?: boolean;
  queryKey: string;
}) {
  const qc = useQueryClient();
  const openUrl = useServerFn(getEvidenceUrl);
  const retry = useServerFn(retryEvidenceExtraction);
  const review = useServerFn(reviewEvidence);
  const [url, setUrl] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);

  const analysis = (row.analysis ?? {}) as {
    visual_description?: string;
    notes?: string[];
    explanation?: string[];
  };
  const allSegments: Segment[] = Array.isArray(row.segments) ? (row.segments as Segment[]) : [];
  const ocrSegments = allSegments.filter((s) => s.kind === "ocr");
  const speechSegments = allSegments.filter((s) => s.kind === "speech");
  const Icon = row.media_kind === "image" ? ImageIcon : row.media_kind === "video" ? FileVideo : Mic;

  const rerun = useMutation({
    mutationFn: () => retry({ data: { evidenceId: row.id } }),
    onSuccess: (r) => {
      toast[r.job_status === "done" ? "success" : "error"](
        r.job_status === "done" ? "Extraction finished." : "Extraction failed again.",
      );
      void qc.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mark = useMutation({
    mutationFn: (input: { status: "reviewed" | "escalated" | "dismissed"; legalHold?: boolean }) =>
      review({ data: { evidenceId: row.id, ...input } }),
    onSuccess: () => {
      toast.success("Evidence updated and audited.");
      void qc.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function preview() {
    try {
      const res = await openUrl({ data: { evidenceId: row.id, expiresIn: 300 } });
      setUrl(res.url);
      setExpiry(res.expiresAt);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <SeverityBadge severity={row.severity as Severity} />
        <JobBadge row={row} />
        <span className="rounded-full border border-border px-2 py-0.5">{row.status}</span>
        {row.legal_hold && (
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
            legal hold
          </span>
        )}
        <span>{new Date(row.created_at).toLocaleString()}</span>
        {row.duration_ms != null && <span>· {(row.duration_ms / 1000).toFixed(1)}s</span>}
        {row.model_version && <span>· {row.model_version}</span>}
      </div>

      {row.job_status === "failed" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <span>Extraction failed after {row.job_attempts} attempt(s): {row.job_error}</span>
          <Button size="sm" variant="outline" disabled={rerun.isPending} onClick={() => rerun.mutate()}>
            <RefreshCw className="size-3" /> Retry
          </Button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-2">
          {url ? (
            row.media_kind === "image" ? (
              <img
                src={url}
                alt="Uploaded evidence under moderator review"
                className="max-h-72 w-full rounded-md border border-border object-contain"
              />
            ) : row.media_kind === "video" ? (
              <video src={url} controls className="max-h-72 w-full rounded-md" />
            ) : (
              <audio src={url} controls className="w-full" />
            )
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">
              <Icon className="size-6" />
              <span>Media is stored privately.</span>
              <Button size="sm" variant="outline" onClick={() => void preview()}>
                Open with a 5-minute signed link
              </Button>
            </div>
          )}
          {expiry && (
            <p className="text-[11px] text-muted-foreground">
              Link expires {new Date(expiry).toLocaleTimeString()} · access recorded in the audit log
            </p>
          )}
          {analysis.visual_description && (
            <p className="text-xs text-muted-foreground">{analysis.visual_description}</p>
          )}
        </div>

        <Column
          title="OCR text"
          confidence={row.ocr_confidence}
          text={row.ocr_text}
          segments={ocrSegments}
          mediaKind={row.media_kind}
          emptyLabel={row.job_status === "done" ? "No readable text found." : "Waiting for extraction…"}
        />
        <Column
          title="Speech transcript"
          confidence={row.transcript_confidence}
          text={row.transcript}
          segments={speechSegments}
          mediaKind={row.media_kind}
          emptyLabel={row.job_status === "done" ? "No speech detected." : "Waiting for transcription…"}
        />
      </div>

      {(analysis.explanation ?? analysis.notes ?? []).length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {(analysis.explanation ?? analysis.notes ?? []).slice(0, 5).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {staff && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => mark.mutate({ status: "reviewed" })}>
            Mark reviewed
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mark.mutate({ status: "escalated", legalHold: true })}
          >
            Escalate &amp; hold
          </Button>
          <Button size="sm" variant="ghost" onClick={() => mark.mutate({ status: "dismissed" })}>
            Dismiss
          </Button>
          <Button size="sm" variant="ghost" disabled={rerun.isPending} onClick={() => rerun.mutate()}>
            <RefreshCw className="size-3" /> Re-run extraction
          </Button>
        </div>
      )}
    </div>
  );
}
