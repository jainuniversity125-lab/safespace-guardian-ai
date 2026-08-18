import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PredictionPanel, SeverityBadge } from "@/components/PredictionPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { EvidenceUploader } from "@/components/EvidenceUploader";
import { previewAnalysis, publishContent } from "@/lib/moderation.functions";
import { CATEGORY_LABELS, REPORT_CATEGORIES, type Severity } from "@/lib/safety";
import { Flag, ShieldAlert, Ban } from "lucide-react";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Community feed — SafeSpace" },
      {
        name: "description",
        content:
          "Post with a pre-publication safety check, see AI severity decisions, and report cyberbullying to trained moderators.",
      },
      { property: "og:title", content: "Community feed — SafeSpace" },
      {
        property: "og:description",
        content: "Pre-publication safety checks, explainable AI flags and one-tap abuse reporting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Feed,
});

type FeedItem = {
  id: string;
  author_id: string;
  body: string;
  language: string;
  severity: Severity;
  visibility_status: string;
  created_at: string;
  conversation_id: string | null;
};

function Feed() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof previewAnalysis>> | null>(null);
  const [needsAck, setNeedsAck] = useState(false);

  const preview = useServerFn(previewAnalysis);
  const publish = useServerFn(publishContent);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useRealtime("feed", ["content_items"], ["feed"]);

  const feed = useQuery({
    queryKey: ["feed"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("id, author_id, body, language, severity, visibility_status, created_at, conversation_id")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedItem[];
    },
  });

  const checkMutation = useMutation({
    mutationFn: () => preview({ data: { text, conversationId: conversationId || undefined } }),
    onSuccess: (res) => {
      setAnalysis(res);
      setNeedsAck(res.severity !== "safe");
    },
    onError: (e: Error) => toast.error(friendly(e)),
  });

  const publishMutation = useMutation({
    mutationFn: (ack: boolean) =>
      publish({ data: { text, conversationId: conversationId || undefined, acknowledgedWarning: ack } }),
    onSuccess: (res) => {
      setAnalysis(res.analysis);
      if (res.status === "warned") {
        setNeedsAck(true);
        toast.warning("Consider revising — this may read as hurtful. Post anyway to continue.");
        return;
      }
      setText("");
      setNeedsAck(false);
      void qc.invalidateQueries({ queryKey: ["feed"] });
      const s = res.analysis.severity;
      if (s === "critical" || s === "high")
        toast.error("Posted but hidden pending urgent human review.");
      else if (s === "medium") toast.warning("Posted with reduced distribution and queued for review.");
      else toast.success("Posted.");
    },
    onError: (e: Error) => toast.error(friendly(e)),
  });

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-4">
          <div className="panel space-y-4 p-5">
            <div>
              <h1 className="text-lg font-semibold">Write a post</h1>
              <p className="text-sm text-muted-foreground">
                Content is analysed before it is published. Emails, phone numbers and links are masked
                before the model sees them.
              </p>
            </div>
            <Textarea
              rows={5}
              value={text}
              placeholder="Say something…"
              onChange={(e) => {
                setText(e.target.value);
                setNeedsAck(false);
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="conv">Conversation / thread id (optional)</Label>
              <Input
                id="conv"
                value={conversationId}
                onChange={(e) => setConversationId(e.target.value)}
                placeholder="thread-42"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!text.trim() || checkMutation.isPending}
                onClick={() => checkMutation.mutate()}
              >
                <ShieldAlert className="size-4" /> Check before posting
              </Button>
              <Button
                disabled={!text.trim() || publishMutation.isPending}
                onClick={() => publishMutation.mutate(needsAck)}
              >
                {needsAck ? "Post anyway" : "Post"}
              </Button>
            </div>
            {analysis && <PredictionPanel p={analysis} />}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent content</h2>
          {feed.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {(feed.data ?? []).map((item) => (
            <article key={item.id} className="panel space-y-3 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SeverityBadge severity={item.severity} />
                <span>{item.visibility_status}</span>
                <span>· {new Date(item.created_at).toLocaleString()}</span>
                {item.conversation_id && <span>· {item.conversation_id}</span>}
              </div>
              <p className="whitespace-pre-wrap text-sm">{item.body}</p>
              <div className="flex gap-2">
                <ReportDialog contentId={item.id} />
                {item.author_id !== user?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const { error } = await supabase
                        .from("blocks")
                        .insert({ blocker_id: user!.id, blocked_id: item.author_id });
                      if (error) toast.error(error.message);
                      else toast.success("Author blocked. You will not see their content.");
                    }}
                  >
                    <Ban className="size-4" /> Block author
                  </Button>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function friendly(e: Error) {
  if (e.message.includes("RATE_LIMIT")) return "Too many checks right now — please retry shortly.";
  if (e.message.includes("NO_CREDITS")) return "AI credits exhausted. Add credits to continue.";
  return e.message;
}

function ReportDialog({ contentId }: { contentId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("harassment");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");

  async function submit() {
    const { error } = await supabase.from("reports").insert({
      reporter_id: user!.id,
      content_id: contentId,
      category,
      description: description || null,
      evidence_url: evidence || null,
      priority: category === "threat_intimidation" || category === "self_harm_encouragement" ? "critical" : "medium",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("audit_logs").insert({
      actor_id: user!.id,
      event_type: "report.created",
      object_type: "content",
      object_id: contentId,
      details: { category },
    });
    setOpen(false);
    toast.success("Report submitted. A moderator will review it — your identity stays private.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Flag className="size-4" /> Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this content</DialogTitle>
          <DialogDescription>
            Your report goes to a trained moderator. The reported user is never shown who reported them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cat">What is happening?</Label>
            <select
              id="cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {REPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">What should the moderator know?</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev">Evidence link (optional)</Label>
            <Input id="ev" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" />
          </div>
          <EvidenceUploader contentId={contentId} label="Attach a screenshot, clip or voice note" />
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()}>Submit report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
