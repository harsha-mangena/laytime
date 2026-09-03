import { scanInvoice } from "./osra";
import type { GateEvent, Invoice, ScanResult } from "./types";

export interface Row {
  invoice: Invoice;
  scan: ScanResult;
}

export function withScans(invoices: Invoice[], gates: GateEvent[]): Row[] {
  return invoices.map((invoice) => ({ invoice, scan: scanInvoice(invoice, gates) }));
}

export function kpis(rows: Row[]) {
  const open = rows.filter((r) => r.invoice.status === "open" || r.invoice.status === "disputed");
  const flagged = open.filter(
    (r) => !r.scan.obligationToPay || r.scan.recommendedAction === "dispute",
  );
  const recoverable = flagged.reduce((sum, r) => sum + r.scan.recoverableAmount, 0);
  const critical = open.filter((r) => r.scan.clock === "critical" || r.scan.clock === "expired");
  const recovered = rows
    .filter((r) => r.invoice.status === "recovered")
    .reduce((sum, r) => sum + r.invoice.amountDue, 0);
  const clean = open.filter((r) => r.scan.obligationToPay && r.scan.recommendedAction === "pay");
  const voidable = open.filter((r) => r.scan.voidable);
  return {
    recoverable,
    flagged: flagged.length,
    critical: critical.length,
    recovered,
    clean: clean.length,
    voidable: voidable.length,
    open: open.length,
    total: rows.length,
    criticalRows: critical.sort((a, b) => (a.scan.daysRemaining ?? 99) - (b.scan.daysRemaining ?? 99)),
    flaggedRows: flagged,
    carrier: byCarrier(rows),
  };
}

function byCarrier(rows: Row[]) {
  const map = new Map<string, { name: string; amount: number; flagged: number }>();
  for (const row of rows) {
    if (row.invoice.status === "paid") continue;
    const name = row.invoice.billingParty;
    const cur = map.get(name) ?? { name, amount: 0, flagged: 0 };
    if (!row.scan.obligationToPay || row.scan.recommendedAction === "dispute") {
      cur.amount += row.scan.recoverableAmount || row.invoice.amountDue;
      cur.flagged += 1;
    }
    map.set(name, cur);
  }
  return Array.from(map.values())
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}
