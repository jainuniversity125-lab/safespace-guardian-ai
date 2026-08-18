import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EvidenceList } from "@/components/EvidenceList";
import { PrivacyReceipt } from "@/components/PrivacyReceipt";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { createPrivacyRequest, confirmPrivacyRequest } from "@/lib/privacy.functions";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy, deletion & consent — SafeSpace" },
      {
        name: "description",
        content:
          "Withdraw consent to automated analysis or erase your data, with a two-step confirmation and an evidence-preserving audit trail for open cases.",
      },
      { property: "og:title", content: "Privacy, deletion & consent — SafeSpace" },
      {
        property: "og:description",
        content: "Two-step data deletion and consent withdrawal with transparent evidence retention.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const create = useServerFn(createPrivacyRequest);
  const confirm = useServerFn(confirmPrivacyRequest);
  const [requestType, setRequestType] = useState<"data_deletion" | "consent_withdrawal">(
    "consent_withdrawal",
  );
  const [scope, setScope] = useState<"content" | "account" | "analytics_only">("content");
  const [reason, setReason] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});

  useRealtime("privacy", ["privacy_requests"], ["my-privacy"]);

  const requests = useQuery({
    queryKey: ["my-privacy", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("privacy_requests")
        .select(
          "id, request_type, scope, status, reason, confirmation_code, outcome_note, preserved_evidence, created_at, processed_at",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const fileRequest = useMutation({
    mutationFn: () => create({ data: { requestType, scope, reason } }),
    onSuccess: (r) => {
      toast.success(`Request filed. Confirm with code ${r.confirmation_code}.`);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["my-privacy"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmRequest = useMutation({
    mutationFn: (input: { requestId: string; code: string }) => confirm({ data: input }),
    onSuccess: (r) => {
      toast.success(
        r.alreadyCompleted
          ? "This request was already completed."
          : `Completed. ${r.preserved} evidence item(s) preserved for open or decided cases.`,
      );
      void qc.invalidateQueries({ queryKey: ["my-privacy"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <AppShell>Loading…</AppShell>;
  if (!user)
    return (
      <AppShell>
        <div className="panel p-6 text-sm">Sign in to manage your data and consent.</div>
      </AppShell>
    );

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Your data, consent and deletion</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        You can withdraw consent to automated analysis or erase your content at any time. Everything
        is confirmed twice, and material that is evidence in an open report or a recorded moderation
        decision is preserved under legal hold — with that retention written into the audit trail.
      </p>

      <Tabs defaultValue="new" className="mt-6">
        <TabsList>
          <TabsTrigger value="new">New request</TabsTrigger>
          <TabsTrigger value="requests">My requests</TabsTrigger>
          <TabsTrigger value="evidence">My evidence</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="pt-4">
          <div className="panel max-w-2xl space-y-4 p-5">
            <div className="space-y-2">
              <Label>What would you like to do?</Label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as typeof requestType)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="consent_withdrawal">Withdraw consent to automated analysis</option>
                <option value="data_deletion">Erase my data</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="content">My posts and uploads</option>
                <option value="account">My whole account</option>
                <option value="analytics_only">Analytics and model-training data only</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Erasure cannot be undone. Evidence attached to an open report or an existing
                moderation decision is kept, redacted from public view, so investigations and
                appeals stay fair to everyone involved.
              </span>
            </div>
            <Button disabled={fileRequest.isPending} onClick={() => fileRequest.mutate()}>
              File request
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-3 pt-4">
          {(requests.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          )}
          {(requests.data ?? []).map((r) => (
            <div key={r.id} className="panel space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
                  {r.request_type.replaceAll("_", " ")}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5">{r.status}</span>
                <span>scope: {r.scope}</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}
              {r.outcome_note && <p className="text-sm">{r.outcome_note}</p>}
              {Array.isArray(r.preserved_evidence) && r.preserved_evidence.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {r.preserved_evidence.length} evidence item(s) retained under legal hold.
                </p>
              )}
              {r.status === "completed" && <PrivacyReceipt requestId={r.id} />}
              {r.status !== "completed" && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Type the confirmation code {r.confirmation_code}
                    </Label>
                    <Input
                      className="w-40"
                      value={codes[r.id] ?? ""}
                      onChange={(e) => setCodes((s) => ({ ...s, [r.id]: e.target.value }))}
                      placeholder={r.confirmation_code}
                    />
                  </div>
                  <Button
                    variant="destructive"
                    disabled={confirmRequest.isPending}
                    onClick={() =>
                      confirmRequest.mutate({ requestId: r.id, code: codes[r.id] ?? "" })
                    }
                  >
                    Confirm irreversibly
                  </Button>
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="evidence" className="pt-4">
          <EvidenceList filter={{ uploaderId: user.id }} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
