import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Plus,
  Upload,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sliders,
  Sparkles,
  Database,
  Cable,
  RefreshCw,
  Globe,
  FileSpreadsheet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeverityBadge } from "@/components/PredictionPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import {
  createDataset,
  runBenchmark,
  getDatasets,
  addFewshotExample,
  toggleFewshotExample,
  deleteFewshotExample,
  createIngestSource,
  simulateIngestedPost,
} from "@/lib/dataset.functions";
import { CATEGORIES, SEVERITIES, CATEGORY_LABELS, pct, type Severity } from "@/lib/safety";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [
      { title: "Evaluation Lab & Connected Apps — SafeSpace" },
      {
        name: "description",
        content:
          "Safety model evaluation playground: run benchmarks, manage few-shot examples, view code-mixed accuracy metrics, and simulate real-time ingestion streams.",
      },
    ],
  }),
  component: LabPage,
});

const CSV_TEMPLATE = `text,language,script_mix,expected_bullying,expected_category,expected_severity,notes
"You are stupid",en,native,true,insult_humiliation,low,"direct insult"
"thum thumbakane iru",kn,code_mixed,true,harassment,medium,"mocking language"
"Namaste, how are you?",hi,code_mixed,false,non_bullying,safe,"polite greetings"`;

function LabPage() {
  const { isStaff, has, loading } = useAuth();
  const allowed = isStaff || has("data_scientist");

  if (loading) return <AppShell>Loading…</AppShell>;
  if (!allowed) {
    return (
      <AppShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">Data Scientist access required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This module is restricted to trust-and-safety researchers, engineers, and administrators.
          </p>
        </div>
      </AppShell>
    );
  }

  return <LabConsole />;
}

function LabConsole() {
  const qc = useQueryClient();
  const upload = useServerFn(createDataset);
  const triggerRun = useServerFn(runBenchmark);
  const datasetsList = useServerFn(getDatasets);
  const addFewshot = useServerFn(addFewshotExample);
  const toggleFewshot = useServerFn(toggleFewshotExample);
  const deleteFewshot = useServerFn(deleteFewshotExample);
  const createSource = useServerFn(createIngestSource);
  const simulatePost = useServerFn(simulateIngestedPost);

  // Real-time listeners
  useRealtime(
    "lab-updates",
    ["datasets", "benchmark_runs", "fewshot_examples", "ingest_sources", "ingested_posts"],
    ["lab-datasets", "fewshot-rules", "ingest-sources", "ingested-feed"],
  );

  const [activeTab, setActiveTab] = useState("datasets");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Upload Dataset Form
  const [dsName, setDsName] = useState("");
  const [dsDesc, setDsDesc] = useState("");
  const [dsSource, setDsSource] = useState("");
  const [dsCsv, setDsCsv] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Fewshot Form
  const [fsText, setFsText] = useState("");
  const [fsLang, setFsLang] = useState("kn");
  const [fsScript, setFsScript] = useState("code_mixed");
  const [fsCategory, setFsCategory] = useState("harassment");
  const [fsBullying, setFsBullying] = useState(true);
  const [fsSeverity, setFsSeverity] = useState<Severity>("medium");
  const [fsRationale, setFsRationale] = useState("");

  // Ingest Source Form
  const [srcName, setSrcName] = useState("");
  const [srcPlatform, setSrcPlatform] = useState("youtube");

  // Ingestion Simulator Form
  const [simSourceId, setSimSourceId] = useState("");
  const [simAuthor, setSimAuthor] = useState("user_handle");
  const [simTarget, setSimTarget] = useState("");
  const [simBody, setSimBody] = useState("");

  // Queries
  const datasets = useQuery({
    queryKey: ["lab-datasets"],
    queryFn: () => datasetsList({}),
  });

  const fewshots = useQuery({
    queryKey: ["fewshot-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fewshot_examples")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const sources = useQuery({
    queryKey: ["ingest-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingest_sources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const ingestedFeed = useQuery({
    queryKey: ["ingested-feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingested_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const selectedDataset = (datasets.data ?? []).find((d) => d.id === selectedDatasetId);

  const runDetails = useQuery({
    queryKey: ["run-details", selectedRunId],
    enabled: Boolean(selectedRunId),
    queryFn: async () => {
      const { data: run, error: rErr } = await supabase
        .from("benchmark_runs")
        .select("*")
        .eq("id", selectedRunId!)
        .single();
      if (rErr) throw new Error(rErr.message);

      const { data: results, error: resErr } = await supabase
        .from("benchmark_results")
        .select("*")
        .eq("run_id", selectedRunId!)
        .limit(100);
      if (resErr) throw new Error(resErr.message);

      return { run, results: results ?? [] };
    },
  });

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: () =>
      upload({ data: { name: dsName, description: dsDesc, sourceNote: dsSource, csvText: dsCsv } }),
    onSuccess: (res) => {
      toast.success(`Dataset uploaded with ${res.sampleCount} test cases.`);
      setDsName("");
      setDsDesc("");
      setDsSource("");
      setDsCsv("");
      setShowUploadModal(false);
      void qc.invalidateQueries({ queryKey: ["lab-datasets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMutation = useMutation({
    mutationFn: (input: { datasetId: string; mode: "baseline" | "tuned"; limit: number }) =>
      triggerRun({ data: input }),
    onSuccess: (res) => {
      toast.success("Benchmark completed successfully.");
      setSelectedRunId(res.runId);
      void qc.invalidateQueries({ queryKey: ["lab-datasets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFewshotMutation = useMutation({
    mutationFn: () =>
      addFewshot({
        data: {
          text: fsText,
          language: fsLang,
          scriptMix: fsScript,
          expectedCategory: fsCategory,
          expectedBullying: fsBullying,
          expectedSeverity: fsSeverity,
          rationale: fsRationale,
        },
      }),
    onSuccess: () => {
      toast.success("Few-shot regional example activated.");
      setFsText("");
      setFsRationale("");
      void qc.invalidateQueries({ queryKey: ["fewshot-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createSourceMutation = useMutation({
    mutationFn: () => createSource({ data: { name: srcName, platform: srcPlatform } }),
    onSuccess: (res) => {
      toast.success(`Connected app '${res.name}' created with secret keys.`);
      setSrcName("");
      void qc.invalidateQueries({ queryKey: ["ingest-sources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simulatePostMutation = useMutation({
    mutationFn: () =>
      simulatePost({
        data: {
          sourceId: simSourceId,
          authorHandle: simAuthor,
          targetHandle: simTarget || undefined,
          body: simBody,
        },
      }),
    onSuccess: () => {
      toast.success("Ingestion webhook simulated successfully!");
      setSimBody("");
      void qc.invalidateQueries({ queryKey: ["ingested-feed", "ingest-sources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFewshotMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => toggleFewshot({ data: input }),
    onSuccess: () => {
      toast.success("Few-shot example status updated.");
      void qc.invalidateQueries({ queryKey: ["fewshot-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFewshotMutation = useMutation({
    mutationFn: (input: { id: string }) => deleteFewshot({ data: input }),
    onSuccess: () => {
      toast.success("Few-shot example deleted.");
      void qc.invalidateQueries({ queryKey: ["fewshot-rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Automatically select the first ingestion source in simulation dropdown
  useEffect(() => {
    if (sources.data && sources.data.length > 0 && !simSourceId) {
      setSimSourceId(sources.data[0]?.id ?? "");
    }
  }, [sources.data, simSourceId]);

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Activity className="size-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evaluation Lab & Connected Apps</h1>
          <p className="text-sm text-muted-foreground">
            Test safety models on custom datasets, configure regional few-shot rules, and hook up external platforms in real time.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="datasets" className="flex items-center gap-2">
            <Database className="size-4" /> Safety Datasets
          </TabsTrigger>
          <TabsTrigger value="fewshots" className="flex items-center gap-2">
            <Sliders className="size-4" /> Few-shot Tuner
          </TabsTrigger>
          <TabsTrigger value="ingestion" className="flex items-center gap-2">
            <Cable className="size-4" /> Connected Apps
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: DATASETS */}
        <TabsContent value="datasets" className="space-y-6 pt-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            {/* Datasets Sidebar */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Test Datasets</h2>
                <Button size="sm" onClick={() => setShowUploadModal(true)}>
                  <Plus className="size-4 mr-1" /> Upload
                </Button>
              </div>

              {datasets.isLoading && <p className="text-sm text-muted-foreground">Loading datasets…</p>}

              {datasets.data?.map((ds) => (
                <div
                  key={ds.id}
                  onClick={() => {
                    setSelectedDatasetId(ds.id);
                    setSelectedRunId(null);
                  }}
                  className={`panel cursor-pointer p-4 transition-all hover:border-primary/40 ${
                    selectedDatasetId === ds.id ? "ring-2 ring-primary/40" : ""
                  }`}
                >
                  <h3 className="text-sm font-semibold">{ds.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{ds.description || "No description"}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                    <span className="rounded-full border px-2 py-0.5">{ds.sample_count} samples</span>
                    {Array.isArray(ds.languages) &&
                      (ds.languages as string[]).map((l) => (
                        <span key={l} className="uppercase font-semibold">
                          {l}
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Benchmark Runner & Analytics */}
            <div className="space-y-6">
              {selectedDataset ? (
                <div className="panel space-y-6 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                    <div>
                      <h2 className="text-lg font-bold">{selectedDataset.name}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">{selectedDataset.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={runMutation.isPending}
                        onClick={() =>
                          runMutation.mutate({ datasetId: selectedDataset.id, mode: "baseline", limit: 50 })
                        }
                      >
                        <Play className="size-3.5 mr-1" /> Baseline Run
                      </Button>
                      <Button
                        size="sm"
                        disabled={runMutation.isPending}
                        onClick={() =>
                          runMutation.mutate({ datasetId: selectedDataset.id, mode: "tuned", limit: 50 })
                        }
                      >
                        <Sparkles className="size-3.5 mr-1 text-yellow-400 fill-yellow-400" /> Tuned Run
                      </Button>
                    </div>
                  </div>

                  {/* Benchmark runs list */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Benchmark History</h3>
                    <div className="flex flex-wrap gap-2">
                      {(selectedDataset.benchmark_runs as any[])?.length === 0 && (
                        <p className="text-xs text-muted-foreground">No benchmark runs recorded yet. Run a baseline to start.</p>
                      )}
                      {(selectedDataset.benchmark_runs as any[])?.map((run) => (
                        <button
                          key={run.id}
                          onClick={() => setSelectedRunId(run.id)}
                          className={`rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                            selectedRunId === run.id ? "bg-accent border-primary" : "border-border hover:bg-muted"
                          }`}
                        >
                          <span className="font-semibold block capitalize">{run.mode} Mode</span>
                          <span className="text-[10px] text-muted-foreground block">{new Date(run.created_at).toLocaleString()}</span>
                          <span className="text-[10px] uppercase font-semibold text-primary block mt-1">
                            Acc: {run.metrics?.overall?.accuracy ? pct(run.metrics.overall.accuracy) : "Pending"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Run Details & Metrics Charts */}
                  {selectedRunId && runDetails.data && (() => {
                    const metrics = runDetails.data.run.metrics as any;
                    return (
                      <div className="space-y-6 border-t border-border pt-6">
                        <div className="grid gap-4 sm:grid-cols-4">
                          {[
                            ["Accuracy", pct(metrics?.overall?.accuracy)],
                            ["Precision", pct(metrics?.overall?.precision)],
                            ["Recall", pct(metrics?.overall?.recall)],
                            ["F1 Score", pct(metrics?.overall?.f1)],
                          ].map(([l, v]) => (
                            <div key={l} className="rounded-lg border border-border p-3">
                              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{l}</p>
                              <p className="text-xl font-bold mt-0.5">{v}</p>
                            </div>
                          ))}
                        </div>

                        {/* Language Charts */}
                        {metrics?.byLanguage && (
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                              F1-Score Breakdown by Language / Dialect
                            </h4>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={metrics.byLanguage}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                  <XAxis dataKey="key" stroke="var(--color-muted-foreground)" fontSize={11} />
                                  <YAxis tickFormatter={(v) => pct(v)} stroke="var(--color-muted-foreground)" fontSize={11} />
                                  <ChartTooltip
                                    formatter={(value) => [pct(Number(value)), "F1 Score"]}
                                    contentStyle={{
                                      background: "var(--color-popover)",
                                      border: "1px solid var(--color-border)",
                                      borderRadius: 8,
                                    }}
                                  />
                                  <Legend />
                                  <Bar dataKey="f1" name="F1 Score" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="accuracy" name="Accuracy" fill="var(--color-muted-foreground)" opacity={0.6} radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Detailed Run Results */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Evaluation Log Details</h4>
                          <div className="max-h-80 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                            {runDetails.data.results.map((res: any) => (
                              <div key={res.id} className="p-3 text-xs flex items-start gap-3 justify-between">
                                <div className="space-y-1 flex-1">
                                  <p className="font-semibold line-clamp-1">"{res.text_preview}"</p>
                                  <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                                    <span className="uppercase">{res.language} ({res.script_mix})</span>
                                    <span>expected: <span className="font-medium text-foreground">{CATEGORY_LABELS[res.expected_category] ?? res.expected_category}</span></span>
                                    <span>predicted: <span className="font-medium text-foreground">{CATEGORY_LABELS[res.predicted_category] ?? res.predicted_category}</span></span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <SeverityBadge severity={res.predicted_severity} />
                                  {res.correct ? (
                                    <CheckCircle2 className="size-4 text-safe shrink-0" />
                                  ) : (
                                    <XCircle className="size-4 text-critical shrink-0" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                </div>
              ) : (
                <div className="panel flex flex-col items-center justify-center text-center p-12">
                  <Database className="size-12 text-muted-foreground stroke-1" />
                  <h3 className="text-base font-semibold mt-4">No dataset selected</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    Select a safety dataset from the left sidebar or upload a new one to evaluate accuracy.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: FEW-SHOT TUNER */}
        <TabsContent value="fewshots" className="space-y-6 pt-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            {/* Add Example Form */}
            <div className="panel p-5 space-y-4">
              <h2 className="text-base font-semibold">Add Tuning Example</h2>
              <p className="text-xs text-muted-foreground">
                Teach the model regional phrasing, sarcasm, or dialects without retraining. Verified examples are dynamically injected into the system prompt.
              </p>

              <div className="space-y-2">
                <Label htmlFor="fsText">Input text example</Label>
                <Textarea
                  id="fsText"
                  rows={3}
                  value={fsText}
                  onChange={(e) => setFsText(e.target.value)}
                  placeholder="e.g. thumbakane haradbeda, stop poking your nose..."
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fsLang">Language</Label>
                  <select
                    id="fsLang"
                    value={fsLang}
                    onChange={(e) => setFsLang(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="kn">Kannada</option>
                    <option value="hi">Hindi</option>
                    <option value="en">English</option>
                    <option value="mr">Marathi</option>
                    <option value="ta">Tamil</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fsScript">Script / Style</Label>
                  <select
                    id="fsScript"
                    value={fsScript}
                    onChange={(e) => setFsScript(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="code_mixed">Code-mixed (Latin)</option>
                    <option value="romanized">Romanised / Transliterated</option>
                    <option value="native">Native script</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fsCategory">Category</Label>
                  <select
                    id="fsCategory"
                    value={fsCategory}
                    onChange={(e) => setFsCategory(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fsSeverity">Severity</Label>
                  <select
                    id="fsSeverity"
                    value={fsSeverity}
                    onChange={(e) => setFsSeverity(e.target.value as Severity)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border border-border rounded-md p-2 text-xs">
                <Label htmlFor="fsBullying" className="font-semibold cursor-pointer">
                  Classified as cyberbullying?
                </Label>
                <Switch
                  id="fsBullying"
                  checked={fsBullying}
                  onCheckedChange={setFsBullying}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fsRationale">Linguistic rationale</Label>
                <Input
                  id="fsRationale"
                  value={fsRationale}
                  onChange={(e) => setFsRationale(e.target.value)}
                  placeholder="e.g. Sarcastic Kannada slang in English alphabet"
                />
              </div>

              <Button
                className="w-full"
                disabled={!fsText.trim() || addFewshotMutation.isPending}
                onClick={() => addFewshotMutation.mutate()}
              >
                <Plus className="size-4 mr-1" /> Add Example
              </Button>
            </div>

            {/* List Active Tuning Rules */}
            <div className="panel p-5 space-y-4">
              <h2 className="text-base font-semibold">Active In-Context Examples ({fewshots.data?.length ?? 0})</h2>
              {fewshots.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">No few-shot tuning examples created yet. Add one to ground the model.</p>
              )}

              <div className="space-y-3 max-h-[500px] overflow-y-auto divide-y divide-border">
                {fewshots.data?.map((fs: any) => (
                  <div key={fs.id} className="pt-3 first:pt-0 flex items-start gap-4 justify-between text-sm">
                    <div className="space-y-1 flex-1">
                      <p className="font-medium">"{fs.text}"</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground uppercase">{fs.language} ({fs.script_mix})</span> ·{" "}
                        {CATEGORY_LABELS[fs.expected_category]} · {fs.expected_severity}
                      </p>
                      {fs.rationale && (
                        <p className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground inline-block">
                          {fs.rationale}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Switch
                        checked={fs.active}
                        onCheckedChange={(active) => toggleFewshotMutation.mutate({ id: fs.id, active })}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive size-8"
                        onClick={() => deleteFewshotMutation.mutate({ id: fs.id })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: CONNECTED APPS */}
        <TabsContent value="ingestion" className="space-y-6 pt-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_2.2fr]">
            {/* Create & Connect App */}
            <div className="space-y-6">
              <div className="panel p-5 space-y-4">
                <h2 className="text-base font-semibold">Register New App Connection</h2>
                <div className="space-y-2">
                  <Label htmlFor="srcName">App name</Label>
                  <Input
                    id="srcName"
                    value={srcName}
                    onChange={(e) => setSrcName(e.target.value)}
                    placeholder="e.g. YouTube Comments Hook"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="srcPlatform">Platform type</Label>
                  <select
                    id="srcPlatform"
                    value={srcPlatform}
                    onChange={(e) => setSrcPlatform(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="youtube">YouTube API</option>
                    <option value="twitter">X / Twitter</option>
                    <option value="instagram">Instagram Graph</option>
                    <option value="custom">Custom Webhook API</option>
                  </select>
                </div>
                <Button
                  className="w-full"
                  disabled={!srcName.trim() || createSourceMutation.isPending}
                  onClick={() => createSourceMutation.mutate()}
                >
                  <Plus className="size-4 mr-1" /> Connect App
                </Button>
              </div>

              {/* Ingestion Webhook Simulator */}
              <div className="panel p-5 space-y-4">
                <h2 className="text-base font-semibold">Webhook Payload Simulator</h2>
                <p className="text-xs text-muted-foreground">
                  Simulate external API webhooks pushing comment streams to the platform. AI classifies, scores, and triggers real-time responses.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="simSource">Select App Source</Label>
                  <select
                    id="simSource"
                    value={simSourceId}
                    onChange={(e) => setSimSourceId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {(sources.data ?? []).map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.platform})
                      </option>
                    ))}
                    {(sources.data ?? []).length === 0 && (
                      <option disabled>No apps registered yet</option>
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="simAuthor">Author Handle</Label>
                  <Input
                    id="simAuthor"
                    value={simAuthor}
                    onChange={(e) => setSimAuthor(e.target.value)}
                    placeholder="e.g. cyber_troll99"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="simTarget">Target Handle (optional)</Label>
                  <Input
                    id="simTarget"
                    value={simTarget}
                    onChange={(e) => setSimTarget(e.target.value)}
                    placeholder="e.g. creator_channel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="simBody">Text Body</Label>
                  <Textarea
                    id="simBody"
                    rows={3}
                    value={simBody}
                    onChange={(e) => setSimBody(e.target.value)}
                    placeholder="Write comment/post body here…"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={!simBody.trim() || !simSourceId || simulatePostMutation.isPending}
                  onClick={() => simulatePostMutation.mutate()}
                >
                  <Cable className="size-4 mr-1 text-green-400 animate-pulse" /> Push Webhook Call
                </Button>
              </div>
            </div>

            {/* Ingestion Feed (Real-time Webhook Receiver) */}
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Activity className="size-4 text-green-500 animate-pulse" /> Real-time Connected Feed
                </h2>
                <span className="text-[10px] border border-green-500/40 bg-green-500/10 px-2 py-0.5 rounded-full text-green-400 uppercase font-semibold">
                  listening
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Webhook calls received in real-time. Safety scores, categories, explanations, and route-actions are calculated instantly.
              </p>

              <div className="space-y-3 max-h-[580px] overflow-y-auto divide-y divide-border">
                {ingestedFeed.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">No webhook inputs received yet. Use the payload simulator on the left to push data.</p>
                )}
                {ingestedFeed.data?.map((post: any) => (
                  <div key={post.id} className="pt-3 first:pt-0 text-sm space-y-2">
                    <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary uppercase">{post.platform}</span>
                        <span>· @{post.author_handle}</span>
                        {post.target_handle && <span>→ @{post.target_handle}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={post.severity} />
                        {post.requires_review && (
                          <span className="bg-destructive/10 border border-destructive/40 text-destructive text-[10px] px-1.5 py-0.5 rounded">
                            Escalated
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{post.body}</p>
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      <span className="bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded">
                        Action: {post.recommended_action.replaceAll("_", " ")}
                      </span>
                      {Array.isArray(post.labels) &&
                        post.labels.slice(0, 3).map((l: any) => (
                          <span key={l.name} className="border px-2 py-0.5 rounded">
                            {CATEGORY_LABELS[l.name] ?? l.name} ({(l.probability * 100).toFixed(0)}%)
                          </span>
                        ))}
                      <span className="text-muted-foreground ml-auto">
                        {new Date(post.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Upload Dataset Dialog */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="panel max-w-2xl w-full bg-background p-6 space-y-4">
            <h2 className="text-lg font-bold">Upload Custom Test Dataset</h2>
            <p className="text-xs text-muted-foreground">
              Paste CSV or JSON dataset contents below. Make sure it contains columns: <code>text</code>, <code>language</code>, <code>expected_bullying</code>, <code>expected_category</code>.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="dsName">Dataset Name</Label>
              <Input
                id="dsName"
                value={dsName}
                onChange={(e) => setDsName(e.target.value)}
                placeholder="e.g. Code-Mixed Indian Slang Benchmarks"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dsDesc">Description</Label>
                <Input
                  id="dsDesc"
                  value={dsDesc}
                  onChange={(e) => setDsDesc(e.target.value)}
                  placeholder="e.g. Evaluating Hindi/Kannada English hybrid text"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dsSource">Source Note</Label>
                <Input
                  id="dsSource"
                  value={dsSource}
                  onChange={(e) => setDsSource(e.target.value)}
                  placeholder="e.g. Curated from Kaggle 2026 dataset"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="dsCsv">Dataset Contents (CSV format)</Label>
                <button
                  onClick={() => setDsCsv(CSV_TEMPLATE)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Insert Sample Template
                </button>
              </div>
              <Textarea
                id="dsCsv"
                rows={6}
                value={dsCsv}
                onChange={(e) => setDsCsv(e.target.value)}
                className="font-mono text-xs"
                placeholder='text,language,script_mix,expected_bullying,expected_category,expected_severity,notes...'
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowUploadModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={!dsName.trim() || !dsCsv.trim() || uploadMutation.isPending}
                onClick={() => uploadMutation.mutate()}
              >
                <Upload className="size-4 mr-1" /> Parse & Seed
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
