import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail — SafeSpace" },
      {
        name: "description",
        content:
          "Append-only record of publications, moderation decisions, appeals and role changes for compliance review.",
      },
      { property: "og:title", content: "Audit trail — SafeSpace" },
      {
        property: "og:description",
        content: "Immutable moderation history with model versions and actors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { isStaff, has, loading } = useAuth();
  const allowed = isStaff || has("auditor");

  useRealtime("audit", ["audit_logs"], ["audit"]);

  const logs = useQuery({
    queryKey: ["audit"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, event_type, object_type, object_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (loading) return <AppShell>Loading…</AppShell>;
  if (!allowed)
    return (
      <AppShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">Auditor access required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The audit trail is append-only and readable by auditors, moderators and administrators.
          </p>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Audit trail</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Append-only. Entries cannot be edited or deleted by anyone, including moderators.
      </p>
      <div className="panel mt-6 divide-y divide-border">
        {(logs.data ?? []).map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {l.event_type}
            </span>
            <span className="text-muted-foreground">
              {l.object_type} {l.object_id?.slice(0, 8)}
            </span>
            <span className="text-xs text-muted-foreground">
              actor {l.actor_id?.slice(0, 8) ?? "system"} · {new Date(l.created_at).toLocaleString()}
            </span>
            <code className="ml-auto max-w-full truncate text-xs text-muted-foreground">
              {JSON.stringify(l.details)}
            </code>
          </div>
        ))}
        {(logs.data ?? []).length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No events recorded yet.</p>
        )}
      </div>
    </AppShell>
  );
}
