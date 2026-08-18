import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Brain, Users, Scale, Eye, FileLock2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { SEVERITY_META, SEVERITIES } from "@/lib/safety";
import { SeverityBadge } from "@/components/PredictionPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SafeSpace — AI Cyberbullying Detection & Moderation" },
      {
        name: "description",
        content:
          "Human-in-the-loop content safety: detect cyberbullying in text, score severity and category, and route uncertain or high-risk cases to trained moderators.",
      },
      { property: "og:title", content: "SafeSpace — AI Cyberbullying Detection & Moderation" },
      {
        property: "og:description",
        content:
          "Detect, classify and review cyberbullying with explainable AI, moderator queues, appeals and full audit trails.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const PILLARS = [
  {
    icon: Brain,
    title: "Explainable detection",
    body: "Multi-label classification across 14 categories with probabilities, evidence phrases and a policy-based risk score — never a black-box verdict.",
  },
  {
    icon: Users,
    title: "Human in the loop",
    body: "Ambiguous, high-risk and low-confidence cases go to a moderator queue. AI recommends; trained people decide.",
  },
  {
    icon: Scale,
    title: "Appeals by default",
    body: "Every enforcement action is reversible, explained to the author, and can be appealed and overturned.",
  },
  {
    icon: FileLock2,
    title: "Privacy by design",
    body: "Emails, phone numbers and links are masked before analysis. Age bands instead of birth dates. Consent is recorded and withdrawable.",
  },
  {
    icon: Eye,
    title: "Immutable audit trail",
    body: "Publication, decisions, role changes and appeals are appended to an audit log that moderators cannot edit.",
  },
  {
    icon: ShieldCheck,
    title: "Context aware",
    body: "Repetition, pile-ons, prior incidents and blocks feed the risk aggregation so one sarcastic line is not treated as harassment.",
  },
];

function Home() {
  return (
    <AppShell>
      <section className="panel relative overflow-hidden px-6 py-14 text-center sm:px-12">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Trust &amp; safety platform</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Detect cyberbullying without handing judgement to a machine
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
          SafeSpace analyses posts and reports for abuse, threats, doxxing and identity-based hate,
          assigns a severity and category, then routes uncertain or high-risk cases to trained human
          moderators with the full context they need.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/feed">Try the safety check</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/safety">Safety centre</Link>
          </Button>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((p) => (
          <article key={p.title} className="panel p-5">
            <p.icon className="size-5 text-primary" />
            <h2 className="mt-3 text-base font-semibold">{p.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
          </article>
        ))}
      </section>

      <section className="panel mt-10 p-6">
        <h2 className="text-lg font-semibold">Severity ladder</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Thresholds are starting points, tuned on precision-recall trade-offs — not accuracy alone.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SEVERITIES.map((s) => (
            <div key={s} className="rounded-lg border border-border p-4">
              <SeverityBadge severity={s} />
              <p className="mt-2 text-sm text-muted-foreground">{SEVERITY_META[s].blurb}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
