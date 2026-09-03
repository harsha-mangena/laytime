import type { ReactNode } from "react";
import { containerPretty, money, shortDate } from "@/lib/format";
import type { Invoice, ScanResult } from "@/lib/types";
import { cn } from "@/lib/utils";

function Row({
  k,
  v,
  miss,
}: {
  k: string;
  v: ReactNode;
  miss?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 border-b border-paper-rule/70 py-2 text-[13px] last:border-0">
      <dt className="text-paper-muted">{k}</dt>
      <dd className={cn("font-medium", miss && "text-destructive")}>{v}</dd>
    </div>
  );
}

function val(value: string | number | null | undefined, fallback = "Not stated") {
  if (value === null || value === undefined || value === "") {
    return { text: fallback, miss: true };
  }
  return { text: String(value), miss: false };
}

export function InvoicePaper({ invoice, scan }: { invoice: Invoice; scan: ScanResult }) {
  const bol = val(invoice.bolNumber);
  const port = invoice.direction === "import" ? val(invoice.port) : { text: invoice.port ?? "—", miss: false };
  const due = val(invoice.dueDate ? shortDate(invoice.dueDate) : null);
  const ft = val(invoice.freeTimeDays !== null ? `${invoice.freeTimeDays} days` : null);
  const fts = val(invoice.freeTimeStart ? shortDate(invoice.freeTimeStart) : null);
  const fte = val(invoice.freeTimeEnd ? shortDate(invoice.freeTimeEnd) : null);
  const avail =
    invoice.direction === "import"
      ? val(invoice.availabilityDate ? shortDate(invoice.availabilityDate) : null)
      : { text: "n/a", miss: false };
  const erd =
    invoice.direction === "export"
      ? val(invoice.earliestReturnDate ? shortDate(invoice.earliestReturnDate) : null)
      : { text: invoice.earliestReturnDate ? shortDate(invoice.earliestReturnDate) : "—", miss: false };
  const charges = val(
    invoice.chargeDates && invoice.chargeDates.length
      ? invoice.chargeDates.map(shortDate).join(", ")
      : null,
  );
  const rule = val(invoice.tariffRule);
  const rate = val(invoice.dailyRate ? `${money(invoice.dailyRate)}/day` : null);
  const contact = val(invoice.contactEmail || invoice.contactPhone);
  const url = val(invoice.disputeUrl);
  const window = val(
    invoice.disputeWindowDays !== null ? `${invoice.disputeWindowDays} days` : null,
    "Not stated / below 30",
  );
  const basis = val(invoice.liabilityBasis);

  return (
    <article className="paper-doc relative h-fit overflow-hidden rounded-xl p-6 sm:p-8">
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-paper-rule pb-4">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-paper-muted uppercase">
            {invoice.billingPartyType} · {invoice.chargeType}
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-tight">{invoice.billingParty}</h2>
          <p className="mt-1 font-mono text-xs text-paper-muted">{invoice.invoiceNumber}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-[0.16em] text-paper-muted uppercase">Amount due</p>
          <p className="font-mono text-2xl tabular-nums">{money(invoice.amountDue)}</p>
        </div>
      </header>

      {!scan.obligationToPay && invoice.status !== "paid" ? (
        <div className="pointer-events-none absolute top-24 right-6 rotate-[-12deg] stamp border-destructive text-destructive opacity-80">
          No obligation to pay
        </div>
      ) : null}

      <dl>
        <Row k="Billed party" v={invoice.billedParty} />
        <Row k="Container" v={<span className="font-mono">{containerPretty(invoice.containerNumber)}</span>} />
        <Row k="Bill of lading" v={bol.text} miss={bol.miss} />
        <Row k="Direction" v={`${invoice.direction} · {invoice.terminal}`} />
        <Row k="Port of discharge" v={port.text} miss={port.miss} />
        <Row k="Liability basis" v={basis.text} miss={basis.miss} />
        <Row k="Invoice date" v={shortDate(invoice.invoiceDate)} />
        <Row k="Due date" v={due.text} miss={due.miss} />
        <Row k="Free time" v={ft.text} miss={ft.miss} />
        <Row k="Free time start" v={fts.text} miss={fts.miss} />
        <Row k="Free time end" v={fte.text} miss={fte.miss} />
        <Row k="Availability" v={avail.text} miss={avail.miss} />
        <Row k="Earliest return" v={erd.text} miss={erd.miss} />
        <Row k="Charge dates" v={charges.text} miss={charges.miss} />
        <Row k="Tariff / rule" v={rule.text} miss={rule.miss} />
        <Row k="Daily rate" v={rate.text} miss={rate.miss} />
        <Row k="Dispute contact" v={contact.text} miss={contact.miss} />
        <Row k="Dispute process" v={url.text} miss={url.miss} />
        <Row k="Dispute window" v={window.text} miss={window.miss} />
        <Row
          k="FMC certification"
          v={invoice.certFmcConsistent ? "Present" : "Absent"}
          miss={!invoice.certFmcConsistent}
        />
        <Row
          k="Performance cert."
          v={invoice.certPerformanceClean ? "Present" : "Absent"}
          miss={!invoice.certPerformanceClean}
        />
      </dl>
      <footer className="mt-5 border-t border-paper-rule pt-3 text-[11px] leading-relaxed text-paper-muted">
        Issued {shortDate(invoice.invoiceDate)}
        {invoice.terminal ? ` · ${invoice.terminal}` : ""}
        {invoice.holdReason ? ` · Hold: ${invoice.holdReason}` : ""}
      </footer>
    </article>
  );
}
