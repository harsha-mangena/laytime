import type { ChargeType, GateEvent, GateEventType } from "../types.ts";
import { asCharge, baseGate, baseInvoice, containerOf, isoDate, isoDateTime } from "./map-invoice.ts";
import type { ParseResult } from "./types.ts";

function segments(text: string, sep = "*") {
  const normalized = text.replace(/\r\n/g, "\n").replace(/~\n?/g, "\n");
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/~$/, "").split(sep));
}

function x12Loops(text: string) {
  const segs = segments(text, "*");
  const loops: string[][][] = [];
  let current: string[][] = [];
  for (const seg of segs) {
    const tag = seg[0] ?? "";
    if (tag === "ST") {
      if (current.length) loops.push(current);
      current = [seg];
    } else if (tag === "SE") {
      current.push(seg);
      loops.push(current);
      current = [];
    } else {
      current.push(seg);
    }
  }
  if (current.length) loops.push(current);
  return loops.filter((loop) => loop[0]?.[0] === "ST" && loop[0]?.[1] === "310");
}

const DTM_MAP: Record<string, keyof ReturnType<typeof emptyDates>> = {
  "007": "invoiceDate",
  "003": "invoiceDate",
  "011": "freeTimeStart",
  "196": "freeTimeStart",
  "197": "freeTimeEnd",
  "036": "freeTimeEnd",
  "140": "availabilityDate",
  "372": "availabilityDate",
  "139": "availabilityDate",
  "369": "earliestReturnDate",
  "035": "lastChargeDate",
};

function emptyDates() {
  return {
    invoiceDate: null as string | null,
    freeTimeStart: null as string | null,
    freeTimeEnd: null as string | null,
    availabilityDate: null as string | null,
    earliestReturnDate: null as string | null,
    lastChargeDate: null as string | null,
  };
}

export function parseEdi310(text: string, sourceConnector = "cma"): ParseResult {
  const warnings: string[] = [];
  const invoices = x12Loops(text).map((loop, idx) => {
    const dates = emptyDates();
    let invoiceNumber = `310-${idx + 1}`;
    let amount = 0;
    let bol: string | null = null;
    let container = "XXXX0000000";
    let billingParty = "Unknown carrier";
    let billedParty = "Northbridge Logistics LLC";
    let port: string | null = null;
    let terminal = "Unknown terminal";
    let scac: string | null = null;
    let chargeType: ChargeType = "demurrage";
    let dailyRate: number | null = null;
    let tariff: string | null = null;
    let contactEmail: string | null = null;
    let contactPhone: string | null = null;
    let disputeUrl: string | null = null;
    let certFmc = false;
    let certPerf = false;
    const chargeDates: string[] = [];
    let dueDate: string | null = null;

    for (const seg of loop) {
      const tag = seg[0];
      if (tag === "B3") {
        invoiceNumber = seg[2] || invoiceNumber;
        bol = seg[4] || bol;
        dates.invoiceDate = isoDate(seg[6]) ?? dates.invoiceDate;
        amount = Number(seg[7] || 0) || amount;
        scac = seg[11] || scac;
      } else if (tag === "N9") {
        const q = seg[1];
        if (q === "BM" || q === "BN") bol = seg[2] || bol;
        if (q === "CN" || q === "EQ") container = containerOf(seg[2]);
        if (q === "IT" || q === "IV") invoiceNumber = seg[2] || invoiceNumber;
      } else if (tag === "N1") {
        if (seg[1] === "CA" || seg[1] === "SH") billingParty = seg[2] || billingParty;
        if (seg[1] === "CN" || seg[1] === "BY") billedParty = seg[2] || billedParty;
      } else if (tag === "N3" && seg[1]?.includes("@")) {
        contactEmail = seg[1];
      } else if (tag === "PER") {
        if (seg[3] === "EM") contactEmail = seg[4] || contactEmail;
        if (seg[3] === "TE") contactPhone = seg[4] || contactPhone;
        if (seg[5] === "EM") contactEmail = seg[6] || contactEmail;
        if (seg[5] === "TE") contactPhone = seg[6] || contactPhone;
        if (seg[3] === "UR") disputeUrl = seg[4] || disputeUrl;
      } else if (tag === "R4") {
        port = seg[4] || seg[3] || port;
        if (seg[1] === "D" || seg[1] === "L") terminal = seg[4] || terminal;
      } else if (tag === "DTM") {
        const field = DTM_MAP[seg[1] ?? ""];
        const d = isoDate(seg[2]);
        if (field && d) dates[field] = d;
        if (seg[1] === "036" || seg[1] === "003") dueDate = d ?? dueDate;
        if (seg[1] === "194" && d) chargeDates.push(d);
      } else if (tag === "L1") {
        const code = (seg[8] || seg[4] || "").toUpperCase();
        if (code.includes("DET")) chargeType = "detention";
        if (code.includes("DEM")) chargeType = "demurrage";
        const rate = Number(seg[2] || 0);
        if (rate) dailyRate = rate;
        const lineAmt = Number(seg[4] || 0);
        if (lineAmt && !amount) amount = lineAmt;
        tariff = seg[12] || tariff;
      } else if (tag === "NTE") {
        const note = (seg[2] || "").toLowerCase();
        if (note.includes("fmc") || note.includes("541")) certFmc = true;
        if (note.includes("performance") || note.includes("incentive")) certPerf = true;
      }
    }

    if (!dates.freeTimeEnd) warnings.push(`${invoiceNumber}: no DTM free-time end (541.6 timing).`);
    if (!contactEmail && !contactPhone && !disputeUrl) {
      warnings.push(`${invoiceNumber}: no PER dispute contact.`);
    }

    return baseInvoice({
      invoiceNumber,
      chargeType: asCharge(chargeType),
      billingParty: scac && billingParty === "Unknown carrier" ? scac : billingParty,
      billedParty,
      bolNumber: bol,
      containerNumber: container,
      port,
      terminal,
      invoiceDate: dates.invoiceDate ?? undefined,
      dueDate,
      freeTimeStart: dates.freeTimeStart,
      freeTimeEnd: dates.freeTimeEnd,
      availabilityDate: dates.availabilityDate,
      earliestReturnDate: dates.earliestReturnDate,
      chargeDates: chargeDates.length ? chargeDates : null,
      amountDue: amount,
      tariffRule: tariff,
      dailyRate,
      contactEmail,
      contactPhone,
      disputeUrl,
      certFmcConsistent: certFmc,
      certPerformanceClean: certPerf,
      lastChargeDate: dates.lastChargeDate ?? dates.invoiceDate ?? undefined,
      sourceConnector,
      sourceFormat: "edi310",
    });
  });

  if (!invoices.length) warnings.push("No ST*310 loops found.");
  return { format: "edi310", invoices, gates: [], warnings };
}

function edifactSegs(text: string) {
  return text
    .replace(/\r\n/g, "")
    .replace(/\n/g, "")
    .split("'")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split("+"));
}

function codecoDocs(text: string) {
  const segs = edifactSegs(text);
  const docs: string[][][] = [];
  let current: string[][] = [];
  for (const seg of segs) {
    if (seg[0] === "UNH") {
      if (current.length) docs.push(current);
      current = [seg];
    } else if (seg[0] === "UNT") {
      current.push(seg);
      docs.push(current);
      current = [];
    } else current.push(seg);
  }
  if (current.length) docs.push(current);
  return docs.filter((d) => (d[0]?.[2] ?? "").includes("CODECO"));
}

function codecoEvent(bgm: string | undefined): GateEventType {
  const n = (bgm ?? "").split(":")[0];
  if (n === "34" || n === "36E") return "outgate";
  if (n === "36" || n === "35") return "ingate";
  if (n === "265" || n === "10") return "discharge";
  if (n === "98") return "available";
  if (n === "83") return "empty_return";
  return "available";
}

export function parseCodeco(text: string, sourceConnector = "maher"): ParseResult {
  const warnings: string[] = [];
  const gates: GateEvent[] = [];
  for (const doc of codecoDocs(text)) {
    let container = "XXXX0000000";
    let terminal = "Maher Terminals";
    let timestamp = `${isoDate("20260903")}T12:00:00`;
    let eventType: GateEventType = "available";
    let notes: string | null = null;
    for (const seg of doc) {
      const tag = seg[0];
      if (tag === "BGM") eventType = codecoEvent(seg[1]);
      if (tag === "EQD") container = containerOf(seg[2]);
      if (tag === "DTM") {
        const body = seg[1] ?? "";
        const parts = body.split(":");
        const qual = parts[0];
        const val = parts[1];
        const fmt = parts[2];
        if (qual === "7" || qual === "132" || qual === "133") {
          timestamp = (fmt === "203" ? isoDateTime(val) : isoDateTime(val)) ?? timestamp;
        }
      }
      if (tag === "LOC") {
        terminal = seg[2]?.split(":")[0] || seg[2] || terminal;
        if (seg[1] === "165" || seg[1] === "9") {
          notes = `Place of availability ${terminal}`;
        }
      }
      if (tag === "NAD" && (seg[1] === "MS" || seg[1] === "TR")) {
        terminal = seg[2] || terminal;
      }
    }
    gates.push(
      baseGate({
        containerNumber: container,
        terminal,
        eventType,
        timestamp: timestamp ?? "2026-09-03T12:00:00",
        source: "terminal",
        notes,
      }),
    );
  }
  if (!gates.length) warnings.push("No CODECO UNH loops found.");
  return { format: "codeco", invoices: [], gates, warnings };
}
