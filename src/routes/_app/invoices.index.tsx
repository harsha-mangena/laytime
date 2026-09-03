import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClockStamp, StatusStamp } from "@/components/status-stamp";
import { Input } from "@/components/ui/input";
import { containerPretty, money } from "@/lib/format";
import { withScans } from "@/lib/selectors";
import { useLaytime } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/invoices/")({
  component: InvoicesPage,
});

const FILTERS = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "critical", label: "Clock" },
  { id: "clean", label: "Clean" },
  { id: "disputed", label: "Disputed" },
] as const;

function InvoicesPage() {
  const invoices = useLaytime((s) => s.invoices);
  const gates = useLaytime((s) => s.gates);
  const rows = withScans(invoices, gates);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter(({ invoice, scan }) => {
      if (filter === "flagged" && scan.obligationToPay && scan.recommendedAction === "pay") return false;
      if (filter === "critical" && scan.clock !== "critical" && scan.clock !== "expired") return false;
      if (filter === "clean" && (!scan.obligationToPay || scan.recommendedAction !== "pay")) return false;
      if (filter === "disputed" && invoice.status !== "disputed") return false;
      if (!query) return true;
      const hay = [
        invoice.containerNumber,
        invoice.invoiceNumber,
        invoice.billingParty,
        invoice.bolNumber,
        invoice.terminal,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [rows, q, filter]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Queue</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Invoices</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Every demurrage and detention invoice on the desk, scored against 46 CFR 541.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search container, BOL, carrier"
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "h-11 rounded-md px-3 text-sm transition-colors duration-150",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {visible.map(({ invoice, scan }) => (
          <li key={invoice.id}>
            <Link
              to="/invoices/$invoiceId"
              params={{ invoiceId: invoice.id }}
              className="flex flex-col gap-3 px-4 py-4 transition-colors duration-150 hover:bg-accent/40 md:grid md:grid-cols-[8.5rem_1fr_6.5rem_7rem] md:items-center md:gap-4"
            >
              <div className="font-mono text-sm">{containerPretty(invoice.containerNumber)}</div>
              <div className="min-w-0">
                <p className="truncate text-sm">{invoice.billingParty}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {invoice.invoiceNumber} · {invoice.chargeType} · {invoice.terminal}
                </p>
              </div>
              <p className="font-mono text-sm tabular-nums">{money(invoice.amountDue)}</p>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <StatusStamp scan={scan} status={invoice.status} />
                <ClockStamp clock={scan.clock} days={scan.daysRemaining} />
              </div>
            </Link>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">No invoices match.</li>
        ) : null}
      </ul>
    </div>
  );
}
