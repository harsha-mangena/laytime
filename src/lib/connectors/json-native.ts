import type { GateEvent, GateEventType, Invoice } from "../types.ts";
import {
  asCharge,
  asDirection,
  asPartyType,
  baseGate,
  baseInvoice,
  containerOf,
  isoDate,
  isoDateTime,
  moneyAmount,
  optBool,
  optNum,
  optStr,
} from "./map-invoice.ts";
import type { NativeFormat, ParseResult } from "./types.ts";

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return [v];
  return [];
}

function first<T>(v: T | T[] | undefined | null): T | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

const MOVE: Record<string, GateEventType> = {
  discharge: "discharge",
  disc: "discharge",
  unloaded: "discharge",
  available: "available",
  avail: "available",
  yard_available: "available",
  outgate: "outgate",
  gateout: "outgate",
  out: "outgate",
  pickup: "outgate",
  ingate: "ingate",
  gatein: "ingate",
  in: "ingate",
  empty_return: "empty_return",
  empty: "empty_return",
  return: "empty_return",
  hold: "hold",
};

function moveOf(v: unknown): GateEventType {
  const s = String(v ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return MOVE[s] ?? "available";
}

function collectDates(container: Record<string, unknown>) {
  const dates = arr(rec(container.DateCollection).Date ?? container.dates ?? container.Dates);
  const map: Record<string, string> = {};
  for (const item of dates) {
    const d = rec(item);
    const type = String(d.Type ?? d.type ?? d.code ?? "").toLowerCase();
    const val = isoDate(optStr(d.Value ?? d.value ?? d.date ?? d.Date));
    if (type && val) map[type] = val;
  }
  return map;
}

export function parseCargowise(raw: unknown, sourceConnector = "cargowise"): ParseResult {
  const root = rec(raw);
  const shipment = rec(root.UniversalShipment ?? root.Native ?? root);
  const ship = rec(shipment.Shipment ?? shipment);
  const warnings: string[] = [];
  const invoices: Invoice[] = [];
  const gates: GateEvent[] = [];

  const consol = rec(ship);
  const billed = optStr(consol.LocalClientName) ?? "Northbridge Logistics LLC";
  const bol =
    optStr(consol.WayBillNumber) ??
    optStr(consol.MasterBillOfLading) ??
    optStr(rec(consol.DataContext).Code);
  const containers = arr(
    rec(consol.ContainerCollection).Container ?? consol.containers ?? consol.Containers,
  );
  const charges = arr(rec(consol.JobCosting).Charge ?? rec(consol.ChargeCollection).Charge);

  if (!containers.length) warnings.push("CargoWise payload has no ContainerCollection.");

  for (const item of containers) {
    const c = rec(item);
    const container = containerOf(c.ContainerNumber ?? c.containerNumber);
    const terminal =
      optStr(c.ArrivalLocation ?? c.UnpackLocation ?? c.terminal) ?? "Unknown terminal";
    const port = optStr(c.ArrivalPort ?? c.port) ?? optStr(consol.PortOfDischarge);
    const dates = collectDates(c);
    const related = charges.filter((ch) => {
      const r = rec(ch);
      const eq = optStr(r.Equipment ?? r.ContainerNumber);
      return !eq || containerOf(eq) === container;
    });
    const dnd = related.find((ch) => {
      const code = String(rec(ch).ChargeCode ?? rec(ch).Description ?? "").toLowerCase();
      return code.includes("dem") || code.includes("det") || code.includes("dnd");
    });
    const charge = rec(dnd ?? related[0] ?? {});
    const invoiceNumber =
      optStr(charge.InvoiceNumber ?? charge.Reference) ??
      optStr(c.InvoiceNumber) ??
      `CW-${container.slice(-7)}`;

    invoices.push(
      baseInvoice({
        invoiceNumber,
        chargeType: asCharge(charge.ChargeCode ?? charge.Description),
        direction: asDirection(consol.TransportMode ?? c.Direction),
        billingParty:
          optStr(charge.Creditor ?? consol.CarrierName) ?? "Ocean carrier via CargoWise",
        billingPartyType: asPartyType(charge.CreditorType),
        billedParty: billed,
        bolNumber: bol ?? null,
        containerNumber: container,
        port,
        terminal,
        invoiceDate: dates.invoice ?? isoDate(optStr(charge.InvoiceDate)) ?? undefined,
        dueDate: isoDate(optStr(charge.DueDate)),
        freeTimeDays: optNum(c.FreeTimeDays ?? dates.freetime),
        freeTimeStart: dates.available ?? dates.arrival ?? dates.freetimestart ?? null,
        freeTimeEnd: dates.freetimeend ?? dates.freetimeexpiry ?? null,
        availabilityDate: dates.available ?? dates.yardavailable ?? null,
        earliestReturnDate: dates.emptyreturn ?? dates.earliestreturn ?? null,
        amountDue: moneyAmount(charge.Amount ?? charge.Cost ?? c.OutstandingDnd),
        tariffRule: optStr(charge.Tariff ?? charge.Description),
        dailyRate: optNum(charge.Rate),
        contactEmail: optStr(charge.ContactEmail),
        contactPhone: optStr(charge.ContactPhone),
        disputeUrl: optStr(charge.DisputeUrl),
        certFmcConsistent: optBool(charge.CertFmcConsistent),
        certPerformanceClean: optBool(charge.CertPerformanceClean),
        lastChargeDate: dates.lastcharge ?? isoDate(optStr(charge.InvoiceDate)) ?? undefined,
        sourceConnector,
        sourceFormat: "cargowise",
      }),
    );

    for (const [type, val] of Object.entries(dates)) {
      const allowed = new Set(["discharge", "available", "outgate", "ingate", "emptyreturn", "hold", "arrival"]);
      if (!allowed.has(type)) continue;
      const eventType = type === "arrival" ? "discharge" : moveOf(type);
      gates.push(
        baseGate({
          containerNumber: container,
          terminal,
          eventType,
          timestamp: isoDateTime(val) ?? `${val}T12:00:00`,
          source: "tms",
          notes: `CargoWise ${type}`,
        }),
      );
    }
  }

  return { format: "cargowise", invoices, gates, warnings };
}

export function parseTango(raw: unknown, sourceConnector = "tango"): ParseResult {
  const root = rec(raw);
  const loads = arr(root.loads ?? root.Loads ?? root.tangoShipment ?? root);
  const invoices: Invoice[] = [];
  const gates: GateEvent[] = [];
  const warnings: string[] = [];

  for (const item of loads) {
    const load = rec(item);
    if (!load.container && !load.containerNumber && !load.proNumber) continue;
    const container = containerOf(load.container ?? load.containerNumber);
    const acc = arr(load.accessorials).map(rec);
    const dnd = acc.find((a) => /dem|det|dnd/i.test(String(a.code ?? a.description ?? "")));
    const charge = dnd ?? acc[0] ?? {};
    const milestones = arr(load.milestones).map(rec);
    const terminal = optStr(load.terminal ?? load.destinationTerminal) ?? "Unknown terminal";

    invoices.push(
      baseInvoice({
        invoiceNumber:
          optStr(charge.invoiceNumber ?? load.proNumber) ?? `TG-${container.slice(-7)}`,
        chargeType: asCharge(charge.code ?? load.chargeType),
        direction: asDirection(load.direction),
        billingParty: optStr(load.carrier ?? load.billingParty) ?? "Carrier via Tango",
        billedParty: optStr(load.billTo) ?? "Northbridge Logistics LLC",
        bolNumber: optStr(load.bol ?? load.blNumber),
        containerNumber: container,
        port: optStr(load.port),
        terminal,
        invoiceDate: isoDate(optStr(charge.invoiceDate ?? load.invoiceDate)) ?? undefined,
        dueDate: isoDate(optStr(charge.dueDate)),
        freeTimeDays: optNum(load.freeTimeDays),
        freeTimeStart: isoDate(optStr(load.freeTimeStart)),
        freeTimeEnd: isoDate(optStr(load.freeTimeEnd)),
        availabilityDate: isoDate(optStr(load.availabilityDate)),
        earliestReturnDate: isoDate(optStr(load.earliestReturnDate)),
        amountDue: moneyAmount(charge.amount ?? load.amountDue),
        dailyRate: optNum(charge.rate ?? load.dailyRate),
        tariffRule: optStr(charge.tariff ?? load.tariffRule),
        contactEmail: optStr(load.contactEmail),
        contactPhone: optStr(load.contactPhone),
        disputeUrl: optStr(load.disputeUrl),
        certFmcConsistent: optBool(load.certFmcConsistent),
        certPerformanceClean: optBool(load.certPerformanceClean),
        lastChargeDate: isoDate(optStr(charge.lastChargeDate ?? load.invoiceDate)) ?? undefined,
        sourceConnector,
        sourceFormat: "tango",
      }),
    );

    for (const m of milestones) {
      const ts = isoDateTime(optStr(m.at ?? m.timestamp ?? m.when));
      if (!ts) continue;
      gates.push(
        baseGate({
          containerNumber: container,
          terminal,
          eventType: moveOf(m.code ?? m.event ?? m.type),
          timestamp: ts,
          source: "tms",
          notes: optStr(m.notes) ?? "Tango milestone",
        }),
      );
    }
  }

  if (!invoices.length) warnings.push("Tango payload has no loads.");
  return { format: "tango", invoices, gates, warnings };
}

export function parseMsc(raw: unknown, sourceConnector = "msc"): ParseResult {
  const root = rec(raw);
  const docs = arr(root.invoices ?? root.documents ?? (root.blNumber || root.invoiceNumber ? root : []));
  const invoices: Invoice[] = [];
  const warnings: string[] = [];
  for (const item of docs.length ? docs : [root]) {
    const d = rec(item);
    const cntr = rec(first(arr(d.containers ?? d.container)) ?? d);
    const container = containerOf(cntr.cntrNo ?? cntr.containerNumber ?? d.containerNumber);
    invoices.push(
      baseInvoice({
        invoiceNumber:
          optStr(d.invoiceNumber ?? d.invoiceNo ?? d.documentNumber) ?? `MSC-${container.slice(-7)}`,
        chargeType: asCharge(d.chargeType ?? d.type ?? cntr.chargeType),
        billingParty: optStr(d.issuer ?? d.carrier) ?? "MSC Mediterranean Shipping",
        billedParty: optStr(d.payer ?? d.billedParty) ?? "Northbridge Logistics LLC",
        bolNumber: optStr(d.blNumber ?? d.billOfLading),
        containerNumber: container,
        port: optStr(d.portOfDischarge ?? d.port),
        terminal: optStr(d.terminal ?? cntr.terminal) ?? "Unknown terminal",
        liabilityBasis: optStr(d.liabilityBasis),
        invoiceDate: isoDate(optStr(d.invoiceDate)) ?? undefined,
        dueDate: isoDate(optStr(d.dueDate)),
        freeTimeDays: optNum(d.freeTimeDays ?? cntr.freeTimeDays),
        freeTimeStart: isoDate(optStr(d.freeTimeStart ?? cntr.freeTimeStart)),
        freeTimeEnd: isoDate(optStr(d.freeTimeEnd ?? cntr.freeTimeEnd)),
        availabilityDate: isoDate(optStr(d.availabilityDate ?? cntr.availabilityDate)),
        chargeDates: arr(d.chargeDates).filter((x): x is string => typeof x === "string"),
        amountDue: moneyAmount(d.amountDue ?? d.totalAmount ?? cntr.amount),
        dailyRate: optNum(d.dailyRate),
        tariffRule: optStr(d.tariffRule),
        contactEmail: optStr(d.contactEmail),
        contactPhone: optStr(d.contactPhone),
        disputeUrl: optStr(d.disputeUrl),
        disputeWindowDays: optNum(d.disputeWindowDays) ?? 30,
        certFmcConsistent: optBool(d.certFmcConsistent ?? d.fmcCertification),
        certPerformanceClean: optBool(d.certPerformanceClean ?? d.performanceCertification),
        lastChargeDate: isoDate(optStr(d.lastChargeDate ?? d.invoiceDate)) ?? undefined,
        holdReason: optStr(d.holdReason),
        sourceConnector,
        sourceFormat: "msc",
      }),
    );
  }
  if (!invoices.length) warnings.push("MSC payload has no invoices.");
  return { format: "msc", invoices, gates: [], warnings };
}

export function parseMaersk(raw: unknown, sourceConnector = "maersk"): ParseResult {
  const root = rec(raw);
  const docs = arr(root.invoices ?? (root.invoiceNumber || root.equipment ? root : []));
  const invoices: Invoice[] = [];
  const warnings: string[] = [];
  for (const item of docs.length ? docs : [root]) {
    const d = rec(item);
    const eq = rec(first(arr(d.equipment)) ?? d);
    const container = containerOf(eq.equipmentReference ?? eq.containerNumber ?? d.containerNumber);
    const charges = arr(d.charges).map(rec);
    const dnd = charges.find((c) => /dem|det/i.test(String(c.code ?? c.type ?? "")));
    invoices.push(
      baseInvoice({
        invoiceNumber: optStr(d.invoiceNumber ?? d.invoiceReference) ?? `MAEU-${container.slice(-7)}`,
        chargeType: asCharge(dnd?.code ?? d.chargeType),
        billingParty: optStr(d.issuer ?? d.carrier) ?? "Maersk A/S",
        billedParty: optStr(d.payerName ?? d.billedParty) ?? "Northbridge Logistics LLC",
        bolNumber: optStr(d.transportDocumentReference ?? d.billOfLading),
        containerNumber: container,
        port: optStr(d.unLocationName ?? d.port),
        terminal: optStr(d.facility ?? d.terminal) ?? "Unknown terminal",
        invoiceDate: isoDate(optStr(d.invoiceDate ?? d.issueDate)) ?? undefined,
        dueDate: isoDate(optStr(d.paymentDueDate ?? d.dueDate)),
        freeTimeDays: optNum(d.freeTime ?? eq.freeTime),
        freeTimeStart: isoDate(optStr(d.freeTimeStart ?? eq.freeTimeStart)),
        freeTimeEnd: isoDate(optStr(d.freeTimeEnd ?? eq.freeTimeEnd)),
        availabilityDate: isoDate(optStr(d.cargoAvailabilityDate ?? eq.availabilityDate)),
        earliestReturnDate: isoDate(optStr(d.earliestReturnDate)),
        amountDue: moneyAmount(d.totalAmount ?? dnd?.amount),
        dailyRate: optNum(dnd?.rate ?? d.dailyRate),
        tariffRule: optStr(d.tariff ?? dnd?.tariff),
        contactEmail: optStr(d.contactEmail),
        contactPhone: optStr(d.contactPhone),
        disputeUrl: optStr(d.disputeUrl),
        certFmcConsistent: optBool(d.certFmcConsistent),
        certPerformanceClean: optBool(d.certPerformanceClean),
        lastChargeDate: isoDate(optStr(d.lastChargeDate ?? d.invoiceDate)) ?? undefined,
        sourceConnector,
        sourceFormat: "maersk",
      }),
    );
  }
  if (!invoices.length) warnings.push("Maersk payload has no invoices.");
  return { format: "maersk", invoices, gates: [], warnings };
}

export function parseCmaJson(raw: unknown, sourceConnector = "cma"): ParseResult {
  const root = rec(raw);
  const docs = arr(root.invoices ?? (root.invoiceReference ? root : []));
  const invoices: Invoice[] = [];
  for (const item of docs.length ? docs : [root]) {
    const d = rec(item);
    invoices.push(
      baseInvoice({
        invoiceNumber: optStr(d.invoiceReference ?? d.invoiceNumber) ?? "CMA-UNK",
        chargeType: asCharge(d.chargeType),
        billingParty: optStr(d.carrier) ?? "CMA CGM",
        billedParty: optStr(d.billedParty) ?? "Northbridge Logistics LLC",
        bolNumber: optStr(d.blNumber),
        containerNumber: containerOf(d.containerNumber ?? d.equipment),
        port: optStr(d.port),
        terminal: optStr(d.terminal) ?? "Unknown terminal",
        invoiceDate: isoDate(optStr(d.invoiceDate)) ?? undefined,
        dueDate: isoDate(optStr(d.dueDate)),
        freeTimeDays: optNum(d.freeTimeDays),
        freeTimeStart: isoDate(optStr(d.freeTimeStart)),
        freeTimeEnd: isoDate(optStr(d.freeTimeEnd)),
        availabilityDate: isoDate(optStr(d.availabilityDate)),
        amountDue: moneyAmount(d.amountDue),
        dailyRate: optNum(d.dailyRate),
        contactEmail: optStr(d.contactEmail),
        contactPhone: optStr(d.contactPhone),
        disputeUrl: optStr(d.disputeUrl),
        certFmcConsistent: optBool(d.certFmcConsistent),
        certPerformanceClean: optBool(d.certPerformanceClean),
        lastChargeDate: isoDate(optStr(d.lastChargeDate ?? d.invoiceDate)) ?? undefined,
        sourceConnector,
        sourceFormat: "cma",
      }),
    );
  }
  return { format: "cma", invoices, gates: [], warnings: [] };
}

export function parseTos(raw: unknown, sourceConnector = "apm"): ParseResult {
  const root = rec(raw);
  const terminal = optStr(root.terminal ?? root.facility) ?? "Unknown terminal";
  const events = arr(root.events ?? root.moves ?? root.gateEvents);
  const gates: GateEvent[] = events.map((item) => {
    const e = rec(item);
    return baseGate({
      containerNumber: containerOf(e.container ?? e.containerNumber ?? e.equipment),
      terminal: optStr(e.terminal) ?? terminal,
      eventType: moveOf(e.move ?? e.eventType ?? e.type),
      timestamp: isoDateTime(optStr(e.eventTime ?? e.timestamp ?? e.when)) ?? "2026-09-03T12:00:00",
      source: "terminal",
      notes: optStr(e.notes ?? e.yard ?? e.location),
    });
  });
  return {
    format: "tos",
    invoices: [],
    gates,
    warnings: gates.length ? [] : ["TOS payload has no events."],
  };
}

export function parseLaytime(raw: unknown, sourceConnector?: string): ParseResult {
  const root = rec(raw);
  const invoiceRaw =
    root.invoice && typeof root.invoice === "object" ? rec(root.invoice) : root;
  const container = containerOf(invoiceRaw.containerNumber);
  const chargeDates = arr(invoiceRaw.chargeDates).filter((d): d is string => typeof d === "string");
  const invoice = baseInvoice({
    id: optStr(invoiceRaw.id) ?? undefined,
    invoiceNumber: optStr(invoiceRaw.invoiceNumber) ?? `ING-${Date.now().toString().slice(-6)}`,
    chargeType: asCharge(invoiceRaw.chargeType),
    direction: asDirection(invoiceRaw.direction),
    billingParty: optStr(invoiceRaw.billingParty) ?? "Unknown billing party",
    billingPartyType: asPartyType(invoiceRaw.billingPartyType),
    billedParty: optStr(invoiceRaw.billedParty) ?? "Northbridge Logistics LLC",
    bolNumber: optStr(invoiceRaw.bolNumber),
    containerNumber: container,
    port: optStr(invoiceRaw.port),
    terminal: optStr(invoiceRaw.terminal) ?? "Unknown terminal",
    liabilityBasis: optStr(invoiceRaw.liabilityBasis),
    invoiceDate: isoDate(optStr(invoiceRaw.invoiceDate)) ?? undefined,
    dueDate: isoDate(optStr(invoiceRaw.dueDate)),
    freeTimeDays: optNum(invoiceRaw.freeTimeDays),
    freeTimeStart: isoDate(optStr(invoiceRaw.freeTimeStart)),
    freeTimeEnd: isoDate(optStr(invoiceRaw.freeTimeEnd)),
    availabilityDate: isoDate(optStr(invoiceRaw.availabilityDate)),
    earliestReturnDate: isoDate(optStr(invoiceRaw.earliestReturnDate)),
    chargeDates: chargeDates.length ? chargeDates : null,
    amountDue: moneyAmount(invoiceRaw.amountDue),
    tariffRule: optStr(invoiceRaw.tariffRule),
    dailyRate: optNum(invoiceRaw.dailyRate),
    contactEmail: optStr(invoiceRaw.contactEmail),
    contactPhone: optStr(invoiceRaw.contactPhone),
    disputeUrl: optStr(invoiceRaw.disputeUrl),
    disputeWindowDays: optNum(invoiceRaw.disputeWindowDays),
    certFmcConsistent: optBool(invoiceRaw.certFmcConsistent),
    certPerformanceClean: optBool(invoiceRaw.certPerformanceClean),
    lastChargeDate: isoDate(optStr(invoiceRaw.lastChargeDate ?? invoiceRaw.invoiceDate)) ?? undefined,
    holdReason: optStr(invoiceRaw.holdReason),
    sourceConnector: sourceConnector ?? optStr(invoiceRaw.sourceConnector) ?? "ingest",
    sourceFormat: "laytime",
  });
  const gates = arr(root.gates).map((item, i) => {
    const g = rec(item);
    const eventType = (
      ["discharge", "available", "outgate", "ingate", "empty_return", "hold"] as const
    ).includes(g.eventType as never)
      ? (g.eventType as GateEventType)
      : moveOf(g.eventType);
    const source = g.source === "tms" || g.source === "carrier" ? g.source : "terminal";
    return baseGate({
      id: optStr(g.id) ?? `gte_ing_${Date.now()}_${i}`,
      containerNumber: optStr(g.containerNumber) ?? container,
      terminal: optStr(g.terminal) ?? invoice.terminal,
      eventType,
      timestamp: optStr(g.timestamp) ?? "2026-09-03T12:00:00",
      source,
      notes: optStr(g.notes),
    });
  });
  return { format: "laytime", invoices: [invoice], gates, warnings: [] };
}

export function detectJsonFormat(raw: unknown): NativeFormat {
  const root = rec(raw);
  if (root.UniversalShipment || root.Native || rec(root.Shipment).ContainerCollection) return "cargowise";
  if (root.sourceSystem === "Tango" || root.tangoShipment || Array.isArray(root.loads)) return "tango";
  if ((root.terminal || root.facility) && (Array.isArray(root.events) || Array.isArray(root.moves))) {
    return "tos";
  }
  const nested = arr(root.invoices)[0];
  const probe = nested && typeof nested === "object" ? rec(nested) : root;
  if (probe.equipmentReference || Array.isArray(probe.equipment) || probe.cargoAvailabilityDate) {
    return "maersk";
  }
  if (
    probe.blNumber ||
    probe.cntrNo ||
    Array.isArray(probe.containers) ||
    String(probe.issuer ?? "").includes("MSC")
  ) {
    return "msc";
  }
  if (probe.invoiceReference && (probe.scac === "CMDU" || probe.carrier === "CMA CGM")) return "cma";
  if (root.equipmentReference || Array.isArray(root.equipment) || root.cargoAvailabilityDate) {
    return "maersk";
  }
  return "laytime";
}
