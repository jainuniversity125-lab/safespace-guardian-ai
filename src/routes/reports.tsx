import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SeverityBadge } from "@/components/PredictionPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { EvidenceUploader } from "@/components/EvidenceUploader";
import { EvidenceList } from "@/components/EvidenceList";
import { CATEGORY_LABELS, type Severity } from "@/lib/safety";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "My reports & appeals — SafeSpace" },
      {
        name: "description",
        content:
          "Track the status of the cyberbullying reports you submitted and appeal moderation decisions made about your content.",
      },
      { property: "og:title", content: "My reports & appeals — SafeSpace" },
      {
        property: "og:description",
        content: "Case status, moderator decisions and the appeal process in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [appealText, setAppealText] = useState<Record<string, string>>({});
  useRealtime(
    "my-cases",
    ["reports", "moderation_decisions", "appeals", "media_evidence"],
    ["my-reports", "my-decisions", "my-appeals", "my-evidence"],
  );

  const reports = useQuery({
    queryKey: ["my-reports", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, category, description, status, priority, created_at, closed_at, content_id")
        .eq("reporter_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const decisions = useQuery({
    queryKey: ["decisions-about-me", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moderation_decisions")
        .select("id, decision, action_taken, reason, created_at, content_id, content_items(body, author_id)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).filter(
        (d) => (d.content_items as { author_id?: string } | null)?.author_id === user!.id,
      );
    },
  });

  const appeals = useQuery({
    queryKey: ["my-appeals", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appeals")
        .select("id, decision_id, reason, status, resolution, created_at, resolved_at")
        .eq("appellant_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  async function submitAppeal(decisionId: string) {
    const reason = (appealText[decisionId] ?? "").trim();
    if (!reason) return;
    const { error } = await supabase
      .from("appeals")
      .insert({ decision_id: decisionId, appellant_id: user!.id, reason });
    if (error) {
      toast.error(error.message);
      return;
    }
    setAppealText((s) => ({ ...s, [decisionId]: "" }));
    toast.success("Appeal submitted for independent review.");
    void qc.invalidateQueries({ queryKey: ["my-appeals", user?.id] });
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">My cases</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Reports you filed, decisions taken about your content, and your appeals.
      </p>

      <Tabs defaultValue="reports" className="mt-6">
        <TabsList>
          <TabsTrigger value="reports">Reports filed</TabsTrigger>
          <TabsTrigger value="decisions">Decisions about me</TabsTrigger>
          <TabsTrigger value="appeals">Appeals</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-3 pt-4">
          {(reports.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No reports yet.</p>
          )}
          {(reports.data ?? []).map((r) => (
            <div key={r.id} className="panel space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <SeverityBadge severity={r.priority as Severity} />
                <span className="rounded-full border border-border px-2 py-0.5">{r.status}</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm font-medium">{CATEGORY_LABELS[r.category] ?? r.category}</p>
              {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
              <EvidenceUploader reportId={r.id} />
              <EvidenceList filter={{ reportId: r.id }} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="decisions" className="space-y-3 pt-4">
          {(decisions.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No moderation decisions about your content.</p>
          )}
          {(decisions.data ?? []).map((d) => (
            <div key={d.id} className="panel space-y-3 p-4">
              <p className="text-sm font-medium">
                {d.decision.replaceAll("_", " ")} · action: {d.action_taken}
              </p>
              {d.reason && <p className="text-sm text-muted-foreground">Reason: {d.reason}</p>}
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                {(d.content_items as { body?: string } | null)?.body}
              </p>
              <div className="space-y-2">
                <Textarea
                  placeholder="Why do you think this decision was wrong?"
                  value={appealText[d.id] ?? ""}
                  onChange={(e) => setAppealText((s) => ({ ...s, [d.id]: e.target.value }))}
                />
                <Button size="sm" onClick={() => void submitAppeal(d.id)}>
                  Appeal this decision
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="appeals" className="space-y-3 pt-4">
          {(appeals.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No appeals submitted.</p>
          )}
          {(appeals.data ?? []).map((a) => (
            <div key={a.id} className="panel space-y-1 p-4">
              <p className="text-xs uppercase tracking-wide text-primary">{a.status}</p>
              <p className="text-sm">{a.reason}</p>
              {a.resolution && (
                <p className="text-sm text-muted-foreground">Outcome: {a.resolution}</p>
              )}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
