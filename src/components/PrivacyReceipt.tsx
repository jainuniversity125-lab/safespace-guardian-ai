import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPrivacyReceipt } from "@/lib/privacy.functions";

type Receipt = Awaited<ReturnType<typeof getPrivacyReceipt>>;

export function PrivacyReceipt({ requestId }: { requestId: string }) {
  const fetchReceipt = useServerFn(getPrivacyReceipt);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await fetchReceipt({ data: { requestId } });
      setReceipt(r);
      setOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!receipt) return;
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `safespace-privacy-receipt-${receipt.receiptCode ?? requestId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
        <FileCheck2 className="size-4" /> View receipt
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deletion &amp; consent receipt</DialogTitle>
            <DialogDescription>
              A permanent, auditable record of what was redacted, under which policy and models, and
              what had to be preserved as evidence.
            </DialogDescription>
          </DialogHeader>

          {receipt && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-2">
                <Field label="Receipt code" value={receipt.receiptCode ?? "—"} mono />
                <Field label="Request" value={receipt.requestType.replaceAll("_", " ")} />
                <Field label="Scope" value={receipt.scope} />
                <Field label="Policy version" value={receipt.policyVersion ?? "—"} mono />
                <Field
                  label="Model versions used"
                  value={receipt.modelVersions.join(", ") || "—"}
                  mono
                />
                <Field
                  label="Completed"
                  value={receipt.processedAt ? new Date(receipt.processedAt).toLocaleString() : "—"}
                />
              </div>

              <section>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Redaction summary
                </h3>
                <ul className="space-y-1 rounded-lg border border-border p-3 text-sm">
                  {Object.entries(receipt.redactionSummary).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{k.replaceAll("_", " ")}</span>
                      <span className="text-right font-medium">
                        {Array.isArray(v) ? v.join(", ") : String(v)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Evidence preservation confirmation
                </h3>
                {receipt.preservedEvidence.length === 0 ? (
                  <p className="rounded-lg border border-border p-3 text-muted-foreground">
                    Nothing needed to be preserved — no item was tied to an open case.
                  </p>
                ) : (
                  <ul className="space-y-1 rounded-lg border border-border p-3">
                    {receipt.preservedEvidence.map((e) => (
                      <li key={e.evidenceId} className="flex flex-wrap gap-2 text-xs">
                        <span className="font-mono">{e.evidenceId.slice(0, 8)}…</span>
                        <span className="rounded-full border border-border px-2">{e.status}</span>
                        {e.legalHold && (
                          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 text-primary">
                            legal hold verified
                          </span>
                        )}
                        {e.linkedToReport && <span className="text-muted-foreground">open report</span>}
                        {e.linkedToContent && (
                          <span className="text-muted-foreground">moderated content</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Audit trail
                </h3>
                <ul className="space-y-1 rounded-lg border border-border p-3 text-xs text-muted-foreground">
                  {receipt.auditTrail.map((t, i) => (
                    <li key={i}>
                      {new Date(t.at).toLocaleString()} · {t.event}
                    </li>
                  ))}
                </ul>
              </section>

              <Button size="sm" variant="outline" onClick={download}>
                <Download className="size-4" /> Download receipt (JSON)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs" : "text-sm"}>{value}</p>
    </div>
  );
}
