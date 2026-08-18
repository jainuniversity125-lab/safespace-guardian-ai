import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EvidenceViewer, type EvidenceRow } from "@/components/EvidenceViewer";
import { useRealtime } from "@/hooks/useRealtime";

type Filter = { uploaderId?: string; reportId?: string; contentId?: string; staff?: boolean };

const COLUMNS =
  "id, media_kind, mime_type, ocr_text, transcript, analysis, severity, status, legal_hold, created_at, job_status, job_attempts, job_error, duration_ms, ocr_confidence, transcript_confidence, segments, model_version";

export function EvidenceList({ filter = {} }: { filter?: Filter }) {
  const queryKey = filter.uploaderId ? "my-evidence" : "evidence";

  useRealtime(`evidence-${queryKey}`, ["media_evidence"], [queryKey]);

  const items = useQuery({
    queryKey: [queryKey, filter.uploaderId ?? null, filter.reportId ?? null, filter.contentId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("media_evidence")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter.uploaderId) q = q.eq("uploader_id", filter.uploaderId);
      if (filter.reportId) q = q.eq("report_id", filter.reportId);
      if (filter.contentId) q = q.eq("content_id", filter.contentId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EvidenceRow[];
    },
  });

  const rows = items.data ?? [];
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No multimodal evidence attached yet.</p>;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <EvidenceViewer
          key={row.id}
          row={row}
          staff={Boolean(filter.staff)}
          queryKey={queryKey}
        />
      ))}
    </div>
  );
}
