import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { claimStaffRoles, setUserRole } from "@/lib/moderation.functions";
import { SEVERITIES } from "@/lib/safety";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administration — SafeSpace" },
      {
        name: "description",
        content:
          "Manage roles, review platform volume by severity, and oversee policy thresholds for the cyberbullying detection platform.",
      },
      { property: "og:title", content: "Administration — SafeSpace" },
      {
        property: "og:description",
        content: "Role-based access control, moderation analytics and policy oversight.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const ROLES: AppRole[] = ["user", "moderator", "admin", "auditor", "counselor", "data_scientist"];

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const claim = useServerFn(claimStaffRoles);

  if (loading) return <AppShell>Loading…</AppShell>;

  if (!isAdmin)
    return (
      <AppShell>
        <div className="panel space-y-3 p-6">
          <h1 className="text-lg font-semibold">Administrator access required</h1>
          <p className="text-sm text-muted-foreground">
            If this is a fresh deployment and no administrator exists yet, the first signed-in
            account can provision itself once.
          </p>
          <Button
            disabled={!user}
            onClick={async () => {
              try {
                await claim({});
                toast.success("Staff roles granted. Reload to see the console.");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Provision first administrator
          </Button>
        </div>
      </AppShell>
    );

  return <AdminConsole />;
}

function AdminConsole() {
  const qc = useQueryClient();
  const setRole = useServerFn(setUserRole);

  const people = useQuery({
    queryKey: ["admin-people"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, age_band, account_status, consent_status"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });

  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("content_items").select("severity");
      const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<string, number>;
      (data ?? []).forEach((r) => {
        counts[r.severity] = (counts[r.severity] ?? 0) + 1;
      });
      const [{ count: reports }, { count: appeals }, { count: decisions }] = await Promise.all([
        supabase.from("reports").select("id", { count: "exact", head: true }),
        supabase.from("appeals").select("id", { count: "exact", head: true }),
        supabase.from("moderation_decisions").select("id", { count: "exact", head: true }),
      ]);
      return {
        bySeverity: SEVERITIES.map((s) => ({ severity: s, count: counts[s] ?? 0 })),
        reports: reports ?? 0,
        appeals: appeals ?? 0,
        decisions: decisions ?? 0,
      };
    },
  });

  const mutation = useMutation({
    mutationFn: (input: { targetUserId: string; role: AppRole; grant: boolean }) =>
      setRole({ data: input }),
    onSuccess: () => {
      toast.success("Roles updated and audited.");
      void qc.invalidateQueries({ queryKey: ["admin-people"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Administration</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Reports", stats.data?.reports ?? 0],
          ["Decisions", stats.data?.decisions ?? 0],
          ["Appeals", stats.data?.appeals ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="font-semibold">Content volume by severity</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.data?.bySeverity ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="severity" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="font-semibold">People and roles</h2>
        <p className="text-sm text-muted-foreground">
          Roles are stored in a dedicated table, never on the profile, to prevent privilege
          escalation.
        </p>
        <div className="mt-4 space-y-3">
          {(people.data ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{p.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.age_band} · {p.account_status} · consent {p.consent_status ? "given" : "pending"}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={p.roles.includes(role)}
                      onCheckedChange={(v) =>
                        mutation.mutate({ targetUserId: p.id, role, grant: Boolean(v) })
                      }
                    />
                    {role.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="font-semibold">Policy thresholds (current build)</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Credible threat ≥ 0.80 or self-harm encouragement ≥ 0.70 → critical, urgent review</li>
          <li>Doxxing ≥ 0.75 or sexual exploitation ≥ 0.75 → high, hide and escalate</li>
          <li>Targeted harassment ≥ 0.70 or aggregate risk ≥ 0.70 → medium, moderator queue</li>
          <li>Aggregate risk ≥ 0.35 → low, warn the author before posting</li>
          <li>
            Aggregate risk = 0.45·text + 0.20·context + 0.15·repetition + 0.10·image/OCR +
            0.10·safety
          </li>
        </ul>
      </div>
    </AppShell>
  );
}
