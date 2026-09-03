import { AS_OF_ISO } from "./as-of";
import { emptyInvoiceTemplate, nextIngestId } from "./store";
import type { GateEvent, Invoice } from "./types";

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function bool(v: unknown) {
  return v === true || v === "true";
}

export function normalizeInvoice(raw: Record<string, unknown>): Invoice {
  const base = emptyInvoiceTemplate();
  const chargeType = raw.chargeType === "detention" ? "detention" : "demurrage";
  const direction = raw.direction === "export" ? "export" : "import";
  const billingPartyType =
    raw.billingPartyType === "MTO" || raw.billingPartyType === "NVOCC"
      ? raw.billingPartyType
      : "VOCC";
  const chargeDates = Array.isArray(raw.chargeDates)
    ? raw.chargeDates.filter((d): d is string => typeof d === "string")
    : null;
  return {
    ...base,
    id: str(raw.id) ?? nextIngestId(),
    invoiceNumber: str(raw.invoiceNumber) ?? `ING-${Date.now().toString().slice(-6)}`,
    chargeType,
    direction,
    billingParty: str(raw.billingParty) ?? "Unknown billing party",
    billingPartyType,
    billedParty: str(raw.billedParty) ?? base.billedParty,
    bolNumber: str(raw.bolNumber),
    containerNumber: (str(raw.containerNumber) ?? "XXXX0000000").replace(/\s+/g, ""),
    port: str(raw.port),
    terminal: str(raw.terminal) ?? "Unknown terminal",
    liabilityBasis: str(raw.liabilityBasis),
    invoiceDate: str(raw.invoiceDate) ?? AS_OF_ISO,
    dueDate: str(raw.dueDate),
    freeTimeDays: num(raw.freeTimeDays),
    freeTimeStart: str(raw.freeTimeStart),
    freeTimeEnd: str(raw.freeTimeEnd),
    availabilityDate: str(raw.availabilityDate),
    earliestReturnDate: str(raw.earliestReturnDate),
    chargeDates,
    amountDue: num(raw.amountDue) ?? 0,
    tariffRule: str(raw.tariffRule),
    dailyRate: num(raw.dailyRate),
    contactEmail: str(raw.contactEmail),
    contactPhone: str(raw.contactPhone),
    disputeUrl: str(raw.disputeUrl),
    disputeWindowDays: num(raw.disputeWindowDays),
    certFmcConsistent: bool(raw.certFmcConsistent),
    certPerformanceClean: bool(raw.certPerformanceClean),
    lastChargeDate: str(raw.lastChargeDate) ?? str(raw.invoiceDate) ?? AS_OF_ISO,
    holdReason: str(raw.holdReason),
    status: "open",
    disputeId: null,
    sourceConnector: str(raw.sourceConnector),
    sourceFormat: str(raw.sourceFormat),
  };
}

export function normalizeGates(raw: unknown, fallbackContainer: string): GateEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const g = (item ?? {}) as Record<string, unknown>;
    const eventType = (
      ["discharge", "available", "outgate", "ingate", "empty_return", "hold"] as const
    ).includes(g.eventType as never)
      ? (g.eventType as GateEvent["eventType"])
      : "available";
    const source = g.source === "tms" || g.source === "carrier" ? g.source : "terminal";
    return {
      id: str(g.id) ?? `gte_ing_${Date.now()}_${i}`,
      containerNumber: str(g.containerNumber) ?? fallbackContainer,
      terminal: str(g.terminal) ?? "",
      eventType,
      timestamp: str(g.timestamp) ?? `${AS_OF_ISO}T12:00:00`,
      source,
      notes: str(g.notes),
    };
  });
}

export const SAMPLE_MISSING_CERT = `{
  "invoiceNumber": "MSC-DND-DEMO-01",
  "chargeType": "demurrage",
  "direction": "import",
  "billingParty": "MSC Mediterranean Shipping",
  "billingPartyType": "VOCC",
  "billedParty": "Northbridge Logistics LLC",
  "bolNumber": "MEDUUN24999901",
  "containerNumber": "MSCU9988776",
  "port": "New York / New Jersey",
  "terminal": "APM Terminals Elizabeth",
  "liabilityBasis": "Consignee on bill of lading.",
  "invoiceDate": "2026-08-12",
  "dueDate": "2026-09-11",
  "freeTimeDays": 4,
  "freeTimeStart": "2026-07-28",
  "freeTimeEnd": "2026-08-01",
  "availabilityDate": "2026-07-28",
  "chargeDates": ["2026-08-02", "2026-08-03", "2026-08-04"],
  "amountDue": 9300,
  "tariffRule": "MSC Rule Tariff 004 — Demurrage NY/NJ",
  "dailyRate": 3100,
  "contactEmail": "dnd.us@msc.com",
  "contactPhone": "+1 212 764 4800",
  "disputeUrl": "https://www.msc.com/usa/help-centre/demurrage-detention",
  "disputeWindowDays": 30,
  "certFmcConsistent": false,
  "certPerformanceClean": false,
  "lastChargeDate": "2026-08-04"
}`;

export const SAMPLE_TMS_LAG = `{
  "invoice": {
    "invoiceNumber": "CMA-DM-DEMO-02",
    "chargeType": "demurrage",
    "direction": "import",
    "billingParty": "CMA CGM",
    "billingPartyType": "VOCC",
    "bolNumber": "CMDUUSNYC2499001",
    "containerNumber": "CMAU5566778",
    "port": "Los Angeles",
    "terminal": "WBCT",
    "liabilityBasis": "Consignee.",
    "invoiceDate": "2026-08-20",
    "dueDate": "2026-09-19",
    "freeTimeDays": 4,
    "freeTimeStart": "2026-08-10",
    "freeTimeEnd": "2026-08-14",
    "availabilityDate": "2026-08-10",
    "chargeDates": ["2026-08-15", "2026-08-16"],
    "amountDue": 4500,
    "tariffRule": "CMA CGM Demurrage POLA Rule 23",
    "dailyRate": 2250,
    "contactEmail": "us.dnd@cma-cgm.com",
    "contactPhone": "+1 757 961 2100",
    "disputeUrl": "https://www.cma-cgm.com/ebusiness/detention-demurrage",
    "disputeWindowDays": 30,
    "certFmcConsistent": true,
    "certPerformanceClean": true,
    "lastChargeDate": "2026-08-16"
  },
  "gates": [
    {
      "containerNumber": "CMAU5566778",
      "terminal": "WBCT",
      "eventType": "discharge",
      "timestamp": "2026-08-10T04:10:00",
      "source": "terminal",
      "notes": "Vessel arrival."
    },
    {
      "containerNumber": "CMAU5566778",
      "terminal": "WBCT",
      "eventType": "available",
      "timestamp": "2026-08-11T16:40:00",
      "source": "terminal",
      "notes": "Actually available after customs + yard."
    },
    {
      "containerNumber": "CMAU5566778",
      "terminal": "WBCT",
      "eventType": "available",
      "timestamp": "2026-08-12T09:05:00",
      "source": "tms",
      "notes": "CargoWise ping 16h after terminal availability."
    }
  ]
}`;
