import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { GateTimeline } from "@/components/gate-timeline";
import { InvoicePaper } from "@/components/invoice-paper";
import { OsraChecklist } from "@/components/osra-checklist";
import { ClockStamp, StatusStamp } from "@/components/status-stamp";
import { Button } from "@/components/ui/button";
import { connectorById } from "@/lib/connectors";
import { money, shortDate } from "@/lib/format";
import { scanInvoice } from "@/lib/osra";
import { useLaytime } from "@/lib/store";

export const Route = createFileRoute("/_app/invoices/$invoiceId")({
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const navigate = useNavigate();
  const invoice = useLaytime((s) => s.invoices.find((i) => i.id === invoiceId));
  const gates = useLaytime((s) => s.gates);
  const createDispute = useLaytime((s) => s.createDispute);

  if (!invoice) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">Invoice not on this desk.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/invoices">Back to queue</Link>
        </Button>
      </div>
    );
  }

  const current = invoice;
  const scan = scanInvoice(current, gates);
  const events = gates.filter(
    (g) => g.containerNumber.replace(/\s+/g, "") === current.containerNumber.replace(/\s+/g, ""),
  );

  function pack() {
    const rec = createDispute(current.id);
    if (!rec) return;
    toast("Dispute pack drafted.");
    navigate({ to: "/disputes/$disputeId", params: { disputeId: rec.id } });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          to="/invoices"
          className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Queue
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-mono text-2xl tracking-tight md:text-3xl">{invoice.invoiceNumber}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoice.billingParty} · {money(invoice.amountDue)}
              {invoice.sourceConnector
                ? ` · via ${connectorById(invoice.sourceConnector)?.name ?? invoice.sourceConnector}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusStamp scan={scan} status={invoice.status} />
            <ClockStamp clock={scan.clock} days={scan.daysRemaining} />
            <span className="stamp text-muted-foreground">Score {scan.score}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-card px-4 py-4 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
          <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Obligation</p>
          <p className="mt-2 text-lg">{scan.obligationToPay ? "Pay" : "Do not pay"}</p>
        </div>
        <div className="rounded-lg bg-card px-4 py-4 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
          <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Dispute by</p>
          <p className="mt-2 text-lg">{scan.disputeDeadline ? shortDate(scan.disputeDeadline) : "—"}</p>
        </div>
        <div className="rounded-lg bg-card px-4 py-4 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
          <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">TMS lag</p>
          <p className="mt-2 text-lg">{scan.tmsLagHours !== null ? `${scan.tmsLagHours}h` : "None read"}</p>
        </div>
      </div>

      {invoice.status === "open" && scan.recommendedAction !== "pay" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.08)] sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {scan.voidable
              ? "Required OSRA data is missing or inaccurate. Generate a 541.5 no-obligation notice before the 30-day window closes."
              : "Form is complete. Gate tape still supports a 545.5 incentive-principle dispute."}
          </p>
          <Button onClick={pack}>Generate dispute pack</Button>
        </div>
      ) : invoice.disputeId ? (
        <div className="flex items-center justify-between rounded-xl bg-card p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
          <p className="text-sm text-muted-foreground">A dispute pack already exists for this invoice.</p>
          <Button asChild variant="secondary">
            <Link to="/disputes/$disputeId" params={{ disputeId: invoice.disputeId }}>
              Open pack
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <InvoicePaper invoice={invoice} scan={scan} />
        <div>
          <h2 className="mb-4 text-sm font-medium tracking-wide">OSRA 2022 checklist</h2>
          <OsraChecklist checks={scan.checks} />
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-medium tracking-wide">Gate tape</h2>
        <GateTimeline events={events} />
      </section>
    </div>
  );
}
