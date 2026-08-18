import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Info,
  Radio,
  Plus,
  ArrowRight,
  User,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { createIngestSource, simulateIngestedPost } from "@/lib/dataset.functions";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Connected Messaging Simulator — SafeSpace" },
      {
        name: "description",
        content: "Evaluate live messaging platform interactions intercepted and filtered by SafeSpace safety AI in real-time.",
      },
    ],
  }),
  component: ChatSimulatorPage,
});

const PLATFORM_ICONS = {
  instagram: "📸",
  youtube: "🎥",
  twitter: "🐦",
  custom: "🔌",
};

const PLATFORM_NAMES = {
  instagram: "Instagram DM",
  youtube: "YouTube Live",
  twitter: "X / Twitter DM",
  custom: "Custom Messaging Hook",
};

function ChatSimulatorPage() {
  const { user, loading } = useAuth();

  if (loading) return <AppShell>Loading…</AppShell>;
  if (!user) {
    return (
      <AppShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">Authentication required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Please sign in to access the Connected Messaging Simulator.
          </p>
        </div>
      </AppShell>
    );
  }

  return <ChatConsole />;
}

function ChatConsole() {
  const qc = useQueryClient();
  const createSource = useServerFn(createIngestSource);
  const simulatePost = useServerFn(simulateIngestedPost);

  // Form states
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [senderHandle, setSenderHandle] = useState("harasser_id");
  const [targetHandle, setTargetHandle] = useState("target_user");
  const [currentSender, setCurrentSender] = useState<"sender" | "target">("sender");
  const [messageBody, setMessageBody] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourcePlatform, setNewSourcePlatform] = useState("instagram");
  const [expandedVerdicts, setExpandedVerdicts] = useState<Record<string, boolean>>({});
  const [sidebarTab, setSidebarTab] = useState<"sandbox" | "integrations">("sandbox");
  const [selectedGuidePlatform, setSelectedGuidePlatform] = useState<string>("instagram");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Real-time listener for ingestion source updates and new posts
  useRealtime(
    "messaging-client",
    ["ingest_sources", "ingested_posts"],
    ["chat-sources", "chat-posts"],
  );

  // Queries
  const { data: sources = [], isLoading: loadingSources } = useQuery({
    queryKey: ["chat-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingest_sources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["chat-posts", selectedSourceId],
    enabled: Boolean(selectedSourceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingested_posts")
        .select("*")
        .eq("source_id", selectedSourceId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Set default source when loaded
  useEffect(() => {
    if (sources.length > 0 && !selectedSourceId) {
      setSelectedSourceId(sources[0].id);
    }
  }, [sources, selectedSourceId]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mutations
  const createSourceMutation = useMutation({
    mutationFn: async () => {
      return createSource({
        data: {
          name: newSourceName,
          platform: newSourcePlatform,
        }
      });
    },
    onSuccess: (data) => {
      toast.success(`Successfully connected ${data.name}!`);
      setNewSourceName("");
      setSelectedSourceId(data.id);
      qc.invalidateQueries({ queryKey: ["chat-sources"] });
    },
    onError: (err: any) => {
      toast.error(`Failed to register app: ${err.message}`);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSourceId) throw new Error("Select an active connection");
      
      const author = currentSender === "sender" ? senderHandle : targetHandle;
      const target = currentSender === "sender" ? targetHandle : senderHandle;
      const bodyToSend = messageBody;

      return simulatePost({
        data: {
          sourceId: selectedSourceId,
          authorHandle: author,
          targetHandle: target || undefined,
          body: bodyToSend,
        }
      });
    },
    onSuccess: (post) => {
      setMessageBody("");
      qc.invalidateQueries({ queryKey: ["chat-posts", selectedSourceId] });
      if (post.requires_review) {
        toast.warning("AI Safety Alert: Content flagged and sent for human moderation!");
      } else {
        toast.success("Message evaluated and cleared as safe.");
      }
    },
    onError: (err: any) => {
      toast.error(`Send simulation failed: ${err.message}`);
    },
  });

  const activeSource = sources.find((s) => s.id === selectedSourceId);

  const toggleVerdict = (id: string) => {
    setExpandedVerdicts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <AppShell>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Connected Messaging Simulator</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          SafeSpace intercepts, evaluates, and filters chat messages on connected social applications in real-time. Test live interactions to watch the moderation pipeline trigger.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* LEFT COLUMN: SOURCE SELECTION & CONFIG */}
        <div className="space-y-6">
          {/* Tabs Selector */}
          <div className="flex rounded-lg bg-muted p-1 text-xs">
            <button
              onClick={() => setSidebarTab("sandbox")}
              className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                sidebarTab === "sandbox"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sandbox Simulator
            </button>
            <button
              onClick={() => setSidebarTab("integrations")}
              className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                sidebarTab === "integrations"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🔌 API Webhooks
            </button>
          </div>

          {sidebarTab === "sandbox" ? (
            <>
              {/* Active Connections */}
              <div className="panel p-5 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h2 className="font-semibold text-sm flex items-center gap-1.5">
                    <Radio className="size-4 text-emerald-500 animate-pulse" />
                    Active App Integrations
                  </h2>
                </div>

                {loadingSources ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Loading connections...</p>
                ) : sources.length === 0 ? (
                  <div className="text-center py-4 border border-dashed rounded-lg">
                    <p className="text-xs text-muted-foreground">No connections configured.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[160px] overflow-y-auto">
                    {sources.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSourceId(s.id)}
                        className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
                          selectedSourceId === s.id
                            ? "bg-primary/5 border-primary font-medium"
                            : "border-transparent hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{PLATFORM_ICONS[s.platform as keyof typeof PLATFORM_ICONS] || "🔌"}</span>
                          <div className="truncate">
                            <p className="truncate font-semibold">{s.name}</p>
                            <p className="text-[10px] text-muted-foreground">{PLATFORM_NAMES[s.platform as keyof typeof PLATFORM_NAMES] || s.platform}</p>
                          </div>
                        </div>
                        {s.event_count > 0 && (
                          <span className="bg-muted px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-muted-foreground">
                            {s.event_count} msg
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Register App */}
              <div className="panel p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Connect New Social App</h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="newSrcName" className="text-xs">App Display Name</Label>
                    <Input
                      id="newSrcName"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      placeholder="e.g. My Instagram Direct"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="newSrcPlatform" className="text-xs">Messaging Platform</Label>
                    <select
                      id="newSrcPlatform"
                      value={newSourcePlatform}
                      onChange={(e) => setNewSourcePlatform(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="instagram">📸 Instagram Direct Messenger</option>
                      <option value="twitter">🐦 X / Twitter Direct Messages</option>
                      <option value="youtube">🎥 YouTube Live Stream Chat</option>
                      <option value="custom">🔌 Custom Webhook Integration</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    disabled={!newSourceName.trim() || createSourceMutation.isPending}
                    onClick={() => createSourceMutation.mutate()}
                  >
                    <Plus className="size-3 mr-1" /> Connect App
                  </Button>
                </div>
              </div>

              {/* Sim Chat Profile */}
              <div className="panel p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mock Chat Profiles</h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-rose-500 font-semibold">User A (Sender / perpetrator)</Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-muted-foreground">@</span>
                      <Input
                        value={senderHandle}
                        onChange={(e) => setSenderHandle(e.target.value.toLowerCase().trim())}
                        className="h-8 pl-6 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-emerald-500 font-semibold">User B (Recipient / victim)</Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-muted-foreground">@</span>
                      <Input
                        value={targetHandle}
                        onChange={(e) => setTargetHandle(e.target.value.toLowerCase().trim())}
                        className="h-8 pl-6 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="panel p-5 space-y-4">
              <h2 className="font-semibold text-sm">Real-time Platform Connectors</h2>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                SafeSpace exposes a live REST API webhook to intercept and filter production chat feeds. Follow the connection guide below:
              </p>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Select Platform</Label>
                <select
                  value={selectedGuidePlatform}
                  onChange={(e) => setSelectedGuidePlatform(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="instagram">📸 Instagram Graph Webhooks</option>
                  <option value="whatsapp">💬 WhatsApp Business API</option>
                  <option value="youtube">🎥 YouTube Live Streaming API</option>
                  <option value="twitter">🐦 X / Twitter DM Callback</option>
                  <option value="custom">🔌 Custom SDK Webhooks</option>
                </select>
              </div>

              {/* Webhook Endpoint Box */}
              <div className="bg-muted p-2.5 rounded-lg border text-xs space-y-1.5 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-primary font-mono">Webhook URL</span>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/api/webhook`;
                      navigator.clipboard.writeText(url);
                      setCopiedText("url");
                      setTimeout(() => setCopiedText(null), 2000);
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline font-medium"
                  >
                    {copiedText === "url" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="font-mono text-[9px] select-all break-all bg-background border px-2 py-1 rounded">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/webhook`
                    : "http://localhost:8081/api/webhook"}
                </p>
              </div>

              {/* Guide Contents */}
              <div className="space-y-3 pt-2 text-xs border-t">
                {selectedGuidePlatform === "instagram" && (
                  <div className="space-y-2">
                    <p className="font-semibold text-xs text-foreground">Instagram Graph API Connection:</p>
                    <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-1">
                      <li>Log in to the Meta Developer Portal and register an App.</li>
                      <li>Enable "Instagram Graph API" and request <code className="font-mono text-[9px] bg-muted px-1 rounded">instagram_manage_messages</code>.</li>
                      <li>Navigate to Webhooks page, set Callback to the Webhook URL above.</li>
                      <li>Subscribe to the <code className="font-mono text-[9px] bg-muted px-1 rounded">messages</code> event subscription.</li>
                    </ol>
                  </div>
                )}
                {selectedGuidePlatform === "whatsapp" && (
                  <div className="space-y-2">
                    <p className="font-semibold text-xs text-foreground">WhatsApp Business API Connection:</p>
                    <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-1">
                      <li>Create a WhatsApp Business Developer app on Meta.</li>
                      <li>Configure WhatsApp settings, register your business phone number.</li>
                      <li>In Webhooks, set Callback URL to the SafeSpace webhook URL above.</li>
                      <li>Subscribe to the <code className="font-mono text-[9px] bg-muted px-1 rounded">messages</code> webhook topic.</li>
                    </ol>
                  </div>
                )}
                {selectedGuidePlatform === "youtube" && (
                  <div className="space-y-2">
                    <p className="font-semibold text-xs text-foreground">YouTube Live Stream Connection:</p>
                    <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-1">
                      <li>Go to Google Cloud Console, enable "YouTube Data API v3".</li>
                      <li>Use a polling cron script that calls the <code className="font-mono text-[9px] bg-muted px-1 rounded">liveChatMessages/list</code> endpoint.</li>
                      <li>Forward new message objects to the Webhook URL above.</li>
                    </ol>
                  </div>
                )}
                {selectedGuidePlatform === "twitter" && (
                  <div className="space-y-2">
                    <p className="font-semibold text-xs text-foreground">X / Twitter API Connection:</p>
                    <ol className="list-decimal pl-4 text-[11px] text-muted-foreground space-y-1">
                      <li>Go to Twitter Developer Portal, configure Account Activity API.</li>
                      <li>Register the webhook callback URL pointing to the SafeSpace endpoint.</li>
                      <li>Subscribe to DM events to run real-time moderation scans.</li>
                    </ol>
                  </div>
                )}
                {selectedGuidePlatform === "custom" && (
                  <div className="space-y-2">
                    <p className="font-semibold text-xs text-foreground">Custom Application Integration:</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Transmit message event logs from any Node.js, Python, or Go server using a simple HTTP POST request.
                    </p>
                  </div>
                )}

                {/* Code Snippet */}
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                    <span>Integration Code Example:</span>
                    <button
                      onClick={() => {
                        const code = `fetch("${typeof window !== "undefined" ? window.location.origin : "http://localhost:8081"}/api/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sourceId: "${selectedSourceId || "YOUR_APP_SOURCE_ID"}",
    authorHandle: "sender_user",
    targetHandle: "recipient_user",
    body: "Evaluating text check"
  })
});`;
                        navigator.clipboard.writeText(code);
                        setCopiedText("code");
                        setTimeout(() => setCopiedText(null), 2000);
                      }}
                      className="text-primary hover:underline"
                    >
                      {copiedText === "code" ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                  <pre className="p-2 rounded bg-muted border font-mono text-[9px] overflow-x-auto select-all max-h-[140px]">
{`fetch("${typeof window !== "undefined" ? window.location.origin : "http://localhost:8081"}/api/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sourceId: "${selectedSourceId || "YOUR_APP_SOURCE_ID"}",
    authorHandle: "sender_user",
    targetHandle: "recipient_user",
    body: "Insulting slur or chat body"
  })
});`}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CHAT WINDOW */}
        <div className="panel p-0 flex flex-col min-h-[600px] border border-border/80 bg-background/40 backdrop-blur-md relative">
          {/* Chat Header */}
          {activeSource ? (
            <div className="p-4 border-b flex items-center justify-between bg-card/60 backdrop-blur rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="size-10 bg-primary/10 rounded-full flex items-center justify-center text-lg shadow-inner">
                  {PLATFORM_ICONS[activeSource.platform as keyof typeof PLATFORM_ICONS] || "🔌"}
                </div>
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    {activeSource.name}
                    <span className="size-2 bg-emerald-500 rounded-full animate-pulse" title="Connected to API endpoint" />
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Intercepting {PLATFORM_NAMES[activeSource.platform as keyof typeof PLATFORM_NAMES] || activeSource.platform} stream
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded font-mono">
                  ACTIVE PIPELINE
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 border-b flex items-center justify-center bg-card/60 backdrop-blur rounded-t-xl">
              <p className="text-sm text-muted-foreground">Please select or register an app connection</p>
            </div>
          )}

          {/* Chat Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[440px] min-h-[400px]">
            {!selectedSourceId ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <MessageSquare className="size-12 text-muted-foreground/30" />
                <div>
                  <p className="font-medium text-sm">Select an active connection</p>
                  <p className="text-xs text-muted-foreground max-w-xs mt-1">
                    Choose a messaging platform integration from the left panel to begin testing.
                  </p>
                </div>
              </div>
            ) : loadingMessages ? (
              <div className="space-y-4">
                <div className="h-10 w-2/3 bg-muted animate-pulse rounded-lg" />
                <div className="h-12 w-1/2 bg-muted animate-pulse rounded-lg ml-auto" />
                <div className="h-10 w-3/4 bg-muted animate-pulse rounded-lg" />
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                <Shield className="size-10 text-muted-foreground/20 animate-bounce" />
                <div>
                  <p className="font-medium text-xs">Sandbox channel initialized</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5">
                    Send a test message as `@${senderHandle}` or `@${targetHandle}` below. SafeSpace safety AI will scan it instantly.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg: any) => {
                  const isA = msg.author_handle === senderHandle;
                  const isFlagged = msg.requires_review;
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isA ? "items-start" : "items-end"}`}
                    >
                      {/* Author badge */}
                      <span className="text-[10px] text-muted-foreground mb-1 px-1 flex items-center gap-1 font-mono">
                        <User className="size-2.5" />
                        @{msg.author_handle}
                      </span>

                      {/* Bubble block */}
                      <div className="max-w-[85%] space-y-1">
                        <div
                          className={`p-3 rounded-2xl text-sm transition-all duration-200 border ${
                            isA
                              ? isFlagged
                                ? "bg-red-500/10 border-red-500/40 text-foreground"
                                : "bg-muted/80 border-border text-foreground"
                              : isFlagged
                              ? "bg-red-500/10 border-red-500/40 text-foreground ml-auto"
                              : "bg-primary/10 border-primary/20 text-foreground ml-auto"
                          }`}
                        >
                          {/* Message Body */}
                          <p className={isFlagged ? "line-through opacity-60" : ""}>{msg.body}</p>

                          {/* Flag alert overlay */}
                          {isFlagged && (
                            <div className="mt-2 pt-2 border-t border-red-500/20 flex items-center justify-between gap-4">
                              <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                                <ShieldAlert className="size-3.5" />
                                FLAGGED & INTERCEPTED
                              </span>
                              <button
                                onClick={() => toggleVerdict(msg.id)}
                                className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5"
                              >
                                {expandedVerdicts[msg.id] ? (
                                  <>Hide details <ChevronUp className="size-3" /></>
                                ) : (
                                  <>Explain verdict <ChevronDown className="size-3" /></>
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Explainable AI block */}
                        {isFlagged && expandedVerdicts[msg.id] && (
                          <div className="panel p-3 border-red-500/30 bg-red-500/5 text-xs rounded-xl space-y-2 animate-fadeIn">
                            <div className="flex items-center justify-between border-b border-red-500/10 pb-1.5">
                              <span className="font-semibold text-red-400">SafeSpace safety Verdict</span>
                              <span className="font-mono text-[10px] text-muted-foreground">Risk: {(msg.final_risk * 100).toFixed(0)}%</span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[11px]">
                                <span className="font-medium text-foreground">Category: </span>
                                <span className="bg-red-500/20 px-1 rounded font-bold uppercase text-[9px] text-red-300">
                                  {msg.severity} - {msg.labels?.[0]?.name || "Abuse"}
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground italic leading-relaxed">
                                "{msg.explanation?.[0] || "Regional threat or harassment pattern identified."}"
                              </p>
                            </div>
                            <div className="pt-1.5 border-t border-red-500/10 flex items-center justify-between">
                              <span className="text-[10px] text-amber-500 flex items-center gap-1 font-medium">
                                🛡 Action: routed to mod queue
                              </span>
                              <a
                                href="/moderation"
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                              >
                                View Queue <ArrowRight className="size-2.5" />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Send Input Bar */}
          <div className="p-4 border-t bg-card/60 backdrop-blur rounded-b-xl space-y-3">
            <div className="flex items-center gap-3">
              {/* Send As Selector */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground mr-1">Send message as:</span>
                <button
                  type="button"
                  onClick={() => setCurrentSender("sender")}
                  disabled={!selectedSourceId}
                  className={`px-2 py-1 rounded text-xs transition-all ${
                    currentSender === "sender"
                      ? "bg-rose-500/15 text-rose-500 border border-rose-500/20 font-semibold"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  @{senderHandle}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentSender("target")}
                  disabled={!selectedSourceId}
                  className={`px-2 py-1 rounded text-xs transition-all ${
                    currentSender === "target"
                      ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20 font-semibold"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  @{targetHandle}
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (messageBody.trim() && !sendMessageMutation.isPending) {
                  sendMessageMutation.mutate();
                }
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={
                  selectedSourceId
                    ? `Type a message as @${currentSender === "sender" ? senderHandle : targetHandle}...`
                    : "Register/Select a connected app integration first"
                }
                disabled={!selectedSourceId || sendMessageMutation.isPending}
                className="flex-1 h-9 text-xs"
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0"
                disabled={!selectedSourceId || !messageBody.trim() || sendMessageMutation.isPending}
              >
                <Send className="size-4" />
              </Button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <p className="flex items-center gap-1">
                <Info className="size-3 text-primary" />
                Tips: Test with code-mixed Hindi/Kannada slurs to see regional AI models in action.
              </p>
              <p className="font-mono text-[9px]">
                API: v1beta (Gemini Direct)
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
