import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PredictionPanel, SeverityBadge } from "@/components/PredictionPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { EvidenceList } from "@/components/EvidenceList";
import { useNotifications } from "@/hooks/useNotifications";
import { PrivacyQueue } from "@/components/PrivacyQueue";
import { submitDecision, resolveAppeal } from "@/lib/moderation.functions";
import { CATEGORY_LABELS, type Severity } from "@/lib/safety";

export const Route = createFileRoute("/moderation")({
  head: () => ({
    meta: [
      { title: "Moderation queue — SafeSpace" },
      {
        name: "description",
        content:
          "Priority moderation queue with AI explanations, conversation context, decision options and appeal review for trained moderators.",
      },
      { property: "og:title", content: "Moderation queue — SafeSpace" },
      {
        property: "og:description",
        content: "Review flagged content with evidence, confidence and recommended action.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ModerationPage,
});

type DecisionValue =
  | "confirm_violation"
  | "reject_false_positive"
  | "request_more_context"
  | "escalate_specialist"
  | "mark_quotation_or_self_defense";
type ActionValue = "none" | "warn" | "reduce_visibility" | "hide" | "restrict_account" | "escalate";
type DecisionPayload = {
  contentId: string;
  reportId?: string | null;
  decision: DecisionValue;
  action: ActionValue;
  reason?: string;
};
type AppealPayload = { appealId: string; status: "upheld" | "overturned"; resolution?: string };

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, safe: 4 };

const DECISIONS = [
  ["confirm_violation", "Confirm violation"],
  ["reject_false_positive", "Reject — false positive"],
  ["request_more_context", "Request more context"],
  ["escalate_specialist", "Escalate to specialist"],
  ["mark_quotation_or_self_defense", "Quotation / self-defence"],
] as const;

const ACTIONS = [
  ["none", "No action"],
  ["warn", "Warn author"],
  ["reduce_visibility", "Reduce distribution"],
  ["hide", "Hide content"],
  ["restrict_account", "Restrict account"],
  ["escalate", "Escalate"],
] as const;

function ModerationPage() {
  const { isStaff, loading } = useAuth();
  const { unreadCount } = useNotifications();

  if (loading) return <AppShell>Loading…</AppShell>;
  if (!isStaff)
    return (
      <AppShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">Moderator access required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This console is limited to trained moderators, counsellors and administrators.
          </p>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Moderation console</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        AI output is a recommendation. You decide, and every decision is logged with the model
        version.
      </p>
      <Tabs defaultValue="queue" className="mt-6">
        <TabsList>
          <TabsTrigger value="queue">
            Queue
            {unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="appeals">Appeals</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="privacy">Privacy requests</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="pt-4">
          <Queue />
        </TabsContent>
        <TabsContent value="reports" className="pt-4">
          <ReportQueue />
        </TabsContent>
        <TabsContent value="appeals" className="pt-4">
          <AppealQueue />
        </TabsContent>
        <TabsContent value="evidence" className="pt-4">
          <EvidenceList filter={{ staff: true }} />
        </TabsContent>
        <TabsContent value="privacy" className="pt-4">
          <PrivacyQueue />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Queue() {
  const qc = useQueryClient();
  useRealtime("mod-queue", ["content_items", "model_predictions"], ["mod-queue"], () =>
    toast.info("Queue updated in real time"),
  );
  const decide = useServerFn(submitDecision);
  const { unreadByObject, markRead, items: notifications } = useNotifications();
  const [filter, setFilter] = useState<string>("all");

  const cases = useQuery({
    queryKey: ["mod-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select(
          "id, body, severity, visibility_status, created_at, conversation_id, author_id, model_predictions(*)",
        )
        .eq("requires_review", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: (input: DecisionPayload) => decide({ data: input }),
    onSuccess: () => {
      toast.success("Decision recorded and audited.");
      void qc.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (cases.data ?? [])
    .filter((c) => filter === "all" || c.severity === filter)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["all", "critical", "high", "medium", "low"].map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Queue is clear.</p>}
      {rows.map((c) => {
        const p = (c.model_predictions as unknown[])?.[0] as
          | Parameters<typeof PredictionPanel>[0]["p"]
          | undefined;
        return (
          <CaseCard
            key={c.id}
            contentId={c.id}
            body={c.body}
            severity={c.severity as Severity}
            visibility={c.visibility_status}
            conversationId={c.conversation_id}
            prediction={p}
            unread={unreadByObject[c.id] ?? 0}
            onOpen={() =>
              void markRead(
                notifications.filter((n) => n.object_id === c.id && !n.read).map((n) => n.id),
              )
            }
            onDecide={(payload) => mutation.mutate({ ...payload, contentId: c.id })}
          />
        );
      })}
    </div>
  );
}

function CaseCard({
  contentId,
  body,
  severity,
  visibility,
  conversationId,
  prediction,
  reportId,
  unread = 0,
  onOpen,
  onDecide,
}: {
  contentId: string;
  body: string;
  severity: Severity;
  visibility: string;
  conversationId: string | null;
  prediction?: Parameters<typeof PredictionPanel>[0]["p"] | undefined;
  reportId?: string | undefined;
  unread?: number;
  onOpen?: () => void;
  onDecide: (payload: {
    decision: DecisionValue;
    action: ActionValue;
    reason?: string;
    reportId?: string | null;
  }) => void;
}) {
  const [decision, setDecision] = useState<DecisionValue>("confirm_violation");
  const [action, setAction] = useState<ActionValue>("hide");
  const [reason, setReason] = useState("");

  return (
    <div
      className={`panel space-y-4 p-5 ${unread > 0 ? "ring-2 ring-primary/40" : ""}`}
      onMouseEnter={onOpen}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <SeverityBadge severity={severity} />
        {unread > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            {unread} new activity
          </span>
        )}
        <span>visibility: {visibility}</span>
        {conversationId && <span>· thread {conversationId}</span>}
        <span>· case {contentId.slice(0, 8)}</span>
      </div>
      <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{body}</p>
      <EvidenceList filter={{ contentId, staff: true }} />
      {prediction ? (
        <PredictionPanel p={prediction} />
      ) : (
        <p className="text-xs text-muted-foreground">No model prediction stored for this item.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Decision</Label>
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value as DecisionValue)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {DECISIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Enforcement</Label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as ActionValue)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ACTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Textarea
        placeholder="Rationale shown to the author (required for enforcement)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        onClick={() =>
          onDecide({ decision, action, reason, reportId: reportId ?? null })
        }
      >
        Record decision
      </Button>
    </div>
  );
}

function ReportQueue() {
  const qc = useQueryClient();
  useRealtime("mod-reports", ["reports", "media_evidence"], ["mod-reports"], () =>
    toast.info("New report activity"),
  );
  const decide = useServerFn(submitDecision);
  const reports = useQuery({
    queryKey: ["mod-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(
          "id, category, description, status, priority, created_at, content_id, content_items(id, body, severity, visibility_status, conversation_id, model_predictions(*))",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: (input: DecisionPayload) => decide({ data: input }),
    onSuccess: () => {
      toast.success("Report closed and audited.");
      void qc.invalidateQueries({ queryKey: ["mod-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if ((reports.data ?? []).length === 0)
    return <p className="text-sm text-muted-foreground">No open reports.</p>;

  return (
    <div className="space-y-4">
      {(reports.data ?? []).map((r) => {
        const c = r.content_items as unknown as {
          id: string;
          body: string;
          severity: Severity;
          visibility_status: string;
          conversation_id: string | null;
          model_predictions: unknown[];
        } | null;
        if (!c) return null;
        return (
          <div key={r.id} className="space-y-2">
            <p className="text-sm">
              Reported as{" "}
              <span className="font-medium">{CATEGORY_LABELS[r.category] ?? r.category}</span>
              {r.description ? ` — ${r.description}` : ""}
            </p>
            <CaseCard
              contentId={c.id}
              body={c.body}
              severity={c.severity}
              visibility={c.visibility_status}
              conversationId={c.conversation_id}
              prediction={c.model_predictions?.[0] as Parameters<typeof PredictionPanel>[0]["p"]}
              reportId={r.id}
              onDecide={(payload) => mutation.mutate({ ...payload, contentId: c.id, reportId: r.id })}
            />
          </div>
        );
      })}
    </div>
  );
}

function AppealQueue() {
  const qc = useQueryClient();
  useRealtime("mod-appeals", ["appeals"], ["mod-appeals"]);
  const resolve = useServerFn(resolveAppeal);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const appeals = useQuery({
    queryKey: ["mod-appeals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appeals")
        .select("id, reason, status, created_at, decision_id, moderation_decisions(decision, action_taken, reason)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: (input: AppealPayload) => resolve({ data: input }),
    onSuccess: () => {
      toast.success("Appeal resolved.");
      void qc.invalidateQueries({ queryKey: ["mod-appeals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if ((appeals.data ?? []).length === 0)
    return <p className="text-sm text-muted-foreground">No pending appeals.</p>;

  return (
    <div className="space-y-4">
      {(appeals.data ?? []).map((a) => {
        const d = a.moderation_decisions as unknown as {
          decision: string;
          action_taken: string;
          reason: string | null;
        } | null;
        return (
          <div key={a.id} className="panel space-y-3 p-5">
            <p className="text-xs text-muted-foreground">
              Original decision: {d?.decision.replaceAll("_", " ")} · {d?.action_taken}
            </p>
            <p className="text-sm">{a.reason}</p>
            <Textarea
              placeholder="Resolution note"
              value={notes[a.id] ?? ""}
              onChange={(e) => setNotes((s) => ({ ...s, [a.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  mutation.mutate({ appealId: a.id, status: "overturned", resolution: notes[a.id] ?? "" })
                }
              >
                Overturn
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  mutation.mutate({ appealId: a.id, status: "upheld", resolution: notes[a.id] ?? "" })
                }
              >
                Uphold
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
