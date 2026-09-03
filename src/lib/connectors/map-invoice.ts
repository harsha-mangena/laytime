import { AS_OF_ISO } from "../as-of.ts";
import type { ChargeType, Direction, GateEvent, Invoice } from "../types.ts";

let serial = 500;

export function slugId(prefix: string, invoiceNumber: string) {
  const slug = invoiceNumber.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  serial += 1;
  return `inv_${prefix}_${slug || serial}`;
}

export function asCharge(v: unknown): ChargeType {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("det") && !s.includes("dem")) return "detention";
  return "demurrage";
}

export function asDirection(v: unknown): Direction {
  return String(v ?? "").toLowerCase().includes("exp") ? "export" : "import";
}

export function asPartyType(v: unknown): Invoice["billingPartyType"] {
  const s = String(v ?? "").toUpperCase();
  if (s === "MTO" || s.includes("TERMINAL")) return "MTO";
  if (s === "NVOCC" || s.includes("NVO")) return "NVOCC";
  return "VOCC";
}

export function moneyAmount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function optStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function optNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function optBool(v: unknown): boolean {
  return v === true || v === "true" || v === "Y" || v === "YES";
}

export function containerOf(v: unknown): string {
  return String(v ?? "XXXX0000000").replace(/\s+/g, "").toUpperCase();
}

export function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{6}$/.test(s)) {
    const yy = Number(s.slice(0, 2));
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
  }
  return s;
}

export function isoDateTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 19);
  if (/^\d{12}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00`;
  }
  if (/^\d{8}$/.test(s)) return `${isoDate(s)}T12:00:00`;
  const d = isoDate(s);
  return d ? `${d}T12:00:00` : null;
}

export function baseInvoice(partial: Partial<Invoice> & { invoiceNumber: string; sourceConnector?: string }): Invoice {
  const source = partial.sourceConnector ?? "ingest";
  return {
    id: partial.id ?? slugId(source, partial.invoiceNumber),
    invoiceNumber: partial.invoiceNumber,
    chargeType: partial.chargeType ?? "demurrage",
    direction: partial.direction ?? "import",
    billingParty: partial.billingParty ?? "Unknown billing party",
    billingPartyType: partial.billingPartyType ?? "VOCC",
    billedParty: partial.billedParty ?? "Northbridge Logistics LLC",
    bolNumber: partial.bolNumber ?? null,
    containerNumber: partial.containerNumber ?? "XXXX0000000",
    port: partial.port ?? null,
    terminal: partial.terminal ?? "Unknown terminal",
    liabilityBasis: partial.liabilityBasis ?? null,
    invoiceDate: partial.invoiceDate ?? AS_OF_ISO,
    dueDate: partial.dueDate ?? null,
    freeTimeDays: partial.freeTimeDays ?? null,
    freeTimeStart: partial.freeTimeStart ?? null,
    freeTimeEnd: partial.freeTimeEnd ?? null,
    availabilityDate: partial.availabilityDate ?? null,
    earliestReturnDate: partial.earliestReturnDate ?? null,
    chargeDates: partial.chargeDates ?? null,
    amountDue: partial.amountDue ?? 0,
    tariffRule: partial.tariffRule ?? null,
    dailyRate: partial.dailyRate ?? null,
    contactEmail: partial.contactEmail ?? null,
    contactPhone: partial.contactPhone ?? null,
    disputeUrl: partial.disputeUrl ?? null,
    disputeWindowDays: partial.disputeWindowDays ?? 30,
    certFmcConsistent: partial.certFmcConsistent ?? false,
    certPerformanceClean: partial.certPerformanceClean ?? false,
    lastChargeDate: partial.lastChargeDate ?? partial.invoiceDate ?? AS_OF_ISO,
    holdReason: partial.holdReason ?? null,
    status: "open",
    disputeId: null,
    sourceConnector: partial.sourceConnector ?? null,
    sourceFormat: partial.sourceFormat ?? null,
  };
}

export function baseGate(partial: Omit<GateEvent, "id"> & { id?: string }): GateEvent {
  const container = containerOf(partial.containerNumber);
  const id =
    partial.id ??
    `gte_${container}_${partial.eventType}_${partial.timestamp.replace(/[^0-9]/g, "")}`;
  return {
    id,
    containerNumber: container,
    terminal: partial.terminal,
    eventType: partial.eventType,
    timestamp: partial.timestamp,
    source: partial.source,
    notes: partial.notes ?? null,
  };
}
