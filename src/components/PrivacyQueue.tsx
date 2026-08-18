import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { annotatePrivacyRequest } from "@/lib/privacy.functions";

export function PrivacyQueue() {
  const qc = useQueryClient();
  const annotate = useServerFn(annotatePrivacyRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useRealtime("privacy-queue", ["privacy_requests"], ["privacy-queue"]);

  const requests = useQuery({
    queryKey: ["privacy-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("privacy_requests")
        .select(
          "id, user_id, request_type, scope, status, reason, outcome_note, preserved_evidence, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: (input: {
      requestId: string;
      status: "in_review" | "completed" | "rejected";
      note?: string;
    }) => annotate({ data: input }),
    onSuccess: () => {
      toast.success("Privacy request updated and audited.");
      void qc.invalidateQueries({ queryKey: ["privacy-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = requests.data ?? [];
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No deletion or consent requests.</p>;

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
              {r.request_type.replaceAll("_", " ")}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5">{r.status}</span>
            <span>scope: {r.scope}</span>
            <span>user {r.user_id.slice(0, 8)}</span>
            <span>{new Date(r.created_at).toLocaleString()}</span>
          </div>
          {r.reason && <p className="text-sm">{r.reason}</p>}
          {r.outcome_note && <p className="text-sm text-muted-foreground">{r.outcome_note}</p>}
          {Array.isArray(r.preserved_evidence) && r.preserved_evidence.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {r.preserved_evidence.length} evidence item(s) held for open or decided cases.
            </p>
          )}
          {r.status !== "completed" && (
            <>
              <Textarea
                placeholder="Handling note recorded in the audit trail"
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    mutation.mutate({ requestId: r.id, status: "in_review", note: notes[r.id] ?? "" })
                  }
                >
                  Mark in review
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    mutation.mutate({ requestId: r.id, status: "completed", note: notes[r.id] ?? "" })
                  }
                >
                  Close as handled
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    mutation.mutate({ requestId: r.id, status: "rejected", note: notes[r.id] ?? "" })
                  }
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
