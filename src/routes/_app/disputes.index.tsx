import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { containerPretty, money, shortDate } from "@/lib/format";
import { useLaytime } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/disputes/")({
  component: DisputesPage,
});

function DisputesPage() {
  const disputes = useLaytime((s) => s.disputes);
  const invoices = useLaytime((s) => s.invoices);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">541.8</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Dispute packs</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Notices generated from the OSRA scan, ready to send inside the 30-day window.
        </p>
      </header>

      {disputes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No packs yet. Open a flagged invoice and generate one.</p>
          <Button asChild className="mt-4">
            <Link to="/invoices">Open queue</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {disputes.map((d) => {
            const inv = invoices.find((i) => i.id === d.invoiceId);
            return (
              <li key={d.id}>
                <Link
                  to="/disputes/$disputeId"
                  params={{ disputeId: d.id }}
                  className="flex flex-col gap-2 px-4 py-4 hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-mono text-sm">
                      {inv ? containerPretty(inv.containerNumber) : d.invoiceId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv ? `${inv.billingParty} · ${money(inv.amountDue)}` : "Invoice removed"}
                      {d.grounds[0] ? ` · ${d.grounds[0]}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "stamp",
                        d.status === "accepted"
                          ? "text-ok"
                          : d.status === "sent"
                            ? "text-warn"
                            : d.status === "denied"
                              ? "text-destructive"
                              : "text-steel",
                      )}
                    >
                      {d.status}
                    </span>
                    <span className="text-xs text-muted-foreground">by {shortDate(d.deadline)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
