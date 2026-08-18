import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LifeBuoy, Ban, Flag, Trash2, Scale, BookOpen } from "lucide-react";

export const Route = createFileRoute("/safety")({
  head: () => ({
    meta: [
      { title: "Safety centre — SafeSpace" },
      {
        name: "description",
        content:
          "Guidance for people facing cyberbullying: how to report, block, preserve evidence, appeal decisions, and where to get urgent help.",
      },
      { property: "og:title", content: "Safety centre — SafeSpace" },
      {
        property: "og:description",
        content: "Practical steps, your rights over your data, and crisis escalation guidance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SafetyPage,
});

const STEPS = [
  {
    icon: Flag,
    title: "Report it",
    body: "Use Report on any post. Choose the closest category and add what a moderator would need to understand the situation. Your identity is never revealed to the reported user.",
  },
  {
    icon: Ban,
    title: "Block, mute, restrict",
    body: "Blocking removes the sender's content from your view and is recorded as a context signal that increases the risk score of further contact from them.",
  },
  {
    icon: BookOpen,
    title: "Preserve evidence",
    body: "Keep screenshots and links. Attach an evidence link to your report. High and critical cases automatically preserve the original content for review.",
  },
  {
    icon: Scale,
    title: "Appeal anything",
    body: "If a decision about your content feels wrong, appeal from My cases. A different reviewer looks at it, and outcomes are recorded.",
  },
  {
    icon: Trash2,
    title: "Your data",
    body: "You can delete your content, withdraw consent and request account deletion. Identifiers are masked before analysis and model training uses pseudonymous IDs only.",
  },
];

function SafetyPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Safety centre</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        What to do if you are being targeted online, and how this platform handles your case.
      </p>

      <div className="panel mt-6 border-critical/40 bg-critical/10 p-5">
        <div className="flex items-start gap-3">
          <LifeBuoy className="mt-0.5 size-5 text-critical" />
          <div>
            <h2 className="font-semibold">If someone is in immediate danger</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact local emergency services first. In India you can reach the national emergency
              number 112, the cyber-crime helpline 1930 and report at cybercrime.gov.in, the
              childline for minors on 1098, and the Tele-MANAS mental-health helpline on 14416.
              Critical cases raised here are escalated to a specialist reviewer under a documented
              procedure — they are not a substitute for emergency help.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {STEPS.map((s) => (
          <article key={s.title} className="panel p-5">
            <s.icon className="size-5 text-primary" />
            <h2 className="mt-3 font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </article>
        ))}
      </div>

      <section className="panel mt-6 p-5">
        <h2 className="font-semibold">How decisions are made</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Identifiers are masked and the text is analysed for 14 abuse categories.</li>
          <li>Context — repetition, thread position, prior incidents, blocks — adjusts the risk.</li>
          <li>A policy engine converts scores into a severity level, never into a punishment.</li>
          <li>Medium and above, plus anything low-confidence or ambiguous, goes to a human.</li>
          <li>The decision, model version and rationale are written to an immutable audit log.</li>
        </ol>
      </section>
    </AppShell>
  );
}
