import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AS_OF_ISO } from "./as-of";
import type { Connection, SyncJob } from "./connectors/types";
import type { HarborSnapshot, MarineForecast, OpenPortCall, OpenPull, OpenTerminal, TerminalHours, WeatherAlert } from "./connectors/open-types";
import { buildDisputeLetter, disputeGrounds } from "./dispute-letter";
import { scanInvoice } from "./osra";
import { makeSeed } from "./seed";
import type { DisputeRecord, GateEvent, Invoice, ScanResult } from "./types";

function withSeed() {
  const seed = makeSeed();
  const disputes: DisputeRecord[] = [];
  const recovered = seed.invoices.find((i) => i.id === "inv_one_7733");
  if (recovered) {
    const scan = scanInvoice(recovered, seed.gates);
    disputes.push({
      id: "dsp_one_7733",
      invoiceId: recovered.id,
      createdAt: "2026-08-02",
      grounds: disputeGrounds(scan),
      letter: buildDisputeLetter(recovered, scan),
      status: "accepted",
      deadline: scan.disputeDeadline ?? "2026-08-24",
    });
  }
  const openDisp = seed.invoices.find((i) => i.id === "inv_cos_5581");
  if (openDisp) {
    const scan = scanInvoice(openDisp, seed.gates);
    disputes.push({
      id: "dsp_cos_5581",
      invoiceId: openDisp.id,
      createdAt: "2026-08-22",
      grounds: disputeGrounds(scan),
      letter: buildDisputeLetter(openDisp, scan),
      status: "sent",
      deadline: scan.disputeDeadline ?? "2026-09-16",
    });
  }
  return {
    invoices: seed.invoices,
    gates: seed.gates,
    disputes,
    connections: [] as Connection[],
    syncJobs: [] as SyncJob[],
    harbor: null as HarborSnapshot | null,
    openTerminals: [] as OpenTerminal[],
    portCalls: [] as OpenPortCall[],
    vesselCalls: [] as OpenPortCall[],
    forecast: null as MarineForecast | null,
    alerts: [] as WeatherAlert[],
    gateHours: null as TerminalHours | null,
  };
}

let ingestSerial = 100;
let jobSerial = 1;

function gateKey(g: GateEvent) {
  return `${g.containerNumber}|${g.eventType}|${g.timestamp}|${g.source}`;
}

interface LaytimeState {
  invoices: Invoice[];
  gates: GateEvent[];
  disputes: DisputeRecord[];
  connections: Connection[];
  syncJobs: SyncJob[];
  harbor: HarborSnapshot | null;
  openTerminals: OpenTerminal[];
  portCalls: OpenPortCall[];
  vesselCalls: OpenPortCall[];
  forecast: MarineForecast | null;
  alerts: WeatherAlert[];
  gateHours: TerminalHours | null;
  reset: () => void;
  addInvoice: (invoice: Invoice, extraGates?: GateEvent[]) => void;
  addBatch: (invoices: Invoice[], extraGates?: GateEvent[]) => { addedInvoices: number; addedGates: number };
  createDispute: (invoiceId: string) => DisputeRecord | null;
  markDisputeSent: (disputeId: string) => void;
  markRecovered: (invoiceId: string) => void;
  connectSource: (connection: Omit<Connection, "invoicesPulled" | "gatesPulled" | "lastSyncAt" | "lastError" | "hasKey"> & { hasKey?: boolean }) => void;
  disconnectSource: (connectorId: string) => void;
  setSourceStatus: (connectorId: string, status: Connection["status"], lastError?: string | null) => void;
  recordSync: (job: Omit<SyncJob, "id">) => SyncJob;
  applyOpenPull: (pull: OpenPull) => void;
  setConnections: (connections: Connection[]) => void;
  upsertConnection: (connection: Connection) => void;
}

export const useLaytime = create<LaytimeState>()(
  persist(
    (set, get) => ({
  ...withSeed(),
  reset: () => set(withSeed()),
  addInvoice: (invoice, extraGates = []) => {
    get().addBatch([invoice], extraGates);
  },
  addBatch: (invoices, extraGates = []) => {
    const state = get();
    const knownNumbers = new Set(state.invoices.map((i) => i.invoiceNumber));
    const knownIds = new Set(state.invoices.map((i) => i.id));
    const newInvoices = invoices.filter((i) => !knownNumbers.has(i.invoiceNumber) && !knownIds.has(i.id));
    const knownGates = new Set(state.gates.map(gateKey));
    const newGates = extraGates.filter((g) => !knownGates.has(gateKey(g)));
    if (newInvoices.length || newGates.length) {
      set({
        invoices: [...newInvoices, ...state.invoices],
        gates: [...newGates, ...state.gates],
      });
    }
    return { addedInvoices: newInvoices.length, addedGates: newGates.length };
  },
  createDispute: (invoiceId) => {
    const { invoices, gates, disputes } = get();
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) return null;
    const existing = disputes.find((d) => d.invoiceId === invoiceId);
    if (existing) return existing;
    const scan = scanInvoice(invoice, gates);
    const id = `dsp_${invoiceId.replace(/^inv_/, "")}`;
    const record: DisputeRecord = {
      id,
      invoiceId,
      createdAt: AS_OF_ISO,
      grounds: disputeGrounds(scan),
      letter: buildDisputeLetter(invoice, scan),
      status: "draft",
      deadline: scan.disputeDeadline ?? AS_OF_ISO,
    };
    set({
      disputes: [record, ...disputes],
      invoices: invoices.map((i) =>
        i.id === invoiceId ? { ...i, status: "disputed", disputeId: id } : i,
      ),
    });
    return record;
  },
  markDisputeSent: (disputeId) =>
    set((s) => ({
      disputes: s.disputes.map((d) =>
        d.id === disputeId ? { ...d, status: "sent" as const } : d,
      ),
    })),
  markRecovered: (invoiceId) =>
    set((s) => ({
      invoices: s.invoices.map((i) =>
        i.id === invoiceId ? { ...i, status: "recovered" as const } : i,
      ),
      disputes: s.disputes.map((d) =>
        d.invoiceId === invoiceId ? { ...d, status: "accepted" as const } : d,
      ),
    })),
  connectSource: (connection) =>
    set((s) => ({
      connections: [
        {
          ...connection,
          hasKey: connection.hasKey ?? false,
          lastSyncAt: null,
          lastError: null,
          invoicesPulled: 0,
          gatesPulled: 0,
        },
        ...s.connections.filter((c) => c.connectorId !== connection.connectorId),
      ],
    })),
  disconnectSource: (connectorId) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.connectorId !== connectorId),
    })),
  setSourceStatus: (connectorId, status, lastError = null) =>
    set((s) => ({
      connections: s.connections.map((c) =>
        c.connectorId === connectorId ? { ...c, status, lastError } : c,
      ),
    })),
  recordSync: (job) => {
    const record: SyncJob = { ...job, id: `job_${Date.now()}_${jobSerial++}` };
    set((s) => ({
      syncJobs: [record, ...s.syncJobs].slice(0, 40),
      connections: s.connections.map((c) =>
        c.connectorId === job.connectorId
          ? {
              ...c,
              status: "connected" as const,
              lastSyncAt: job.at,
              lastError: job.warnings[0] ?? null,
              invoicesPulled: job.invoices,
              gatesPulled: job.gates,
            }
          : c,
      ),
    }));
    return record;
  },
  applyOpenPull: (pull) =>
    set((s) => ({
      harbor: pull.harbor !== undefined ? pull.harbor : s.harbor,
      openTerminals: pull.terminals !== undefined ? pull.terminals : s.openTerminals,
      portCalls: pull.portCalls !== undefined ? pull.portCalls : s.portCalls,
      vesselCalls: pull.vesselCalls !== undefined ? pull.vesselCalls : s.vesselCalls,
      forecast: pull.forecast !== undefined ? pull.forecast : s.forecast,
      alerts: pull.alerts !== undefined ? pull.alerts : s.alerts,
      gateHours: pull.gateHours !== undefined ? pull.gateHours : s.gateHours,
    })),
  setConnections: (connections) => set({ connections }),
  upsertConnection: (connection) =>
    set((s) => ({
      connections: [connection, ...s.connections.filter((c) => c.connectorId !== connection.connectorId)],
    })),
    }),
    {
      name: "laytime-desk-v1",
      skipHydration: true,
      partialize: (state) => ({
        invoices: state.invoices,
        gates: state.gates,
        disputes: state.disputes,
        syncJobs: state.syncJobs,
        harbor: state.harbor,
        openTerminals: state.openTerminals,
        portCalls: state.portCalls,
        vesselCalls: state.vesselCalls,
        forecast: state.forecast,
        alerts: state.alerts,
        gateHours: state.gateHours,
        connections: state.connections.filter((c) => c.mode !== "live" && !c.hasKey),
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LaytimeState>;
        const persistedConns = Array.isArray(p.connections)
          ? p.connections.filter((c) => c && c.mode !== "live" && !c.hasKey)
          : [];
        return {
          ...current,
          ...p,
          connections: persistedConns,
          vesselCalls: p.vesselCalls ?? [],
          alerts: p.alerts ?? [],
          forecast: p.forecast ?? null,
          gateHours: p.gateHours ?? null,
          harbor: p.harbor ?? null,
          openTerminals: p.openTerminals ?? [],
          portCalls: p.portCalls ?? [],
        };
      },
    },
  ),
);

export function scanned(invoice: Invoice, gates: GateEvent[]): ScanResult {
  return scanInvoice(invoice, gates);
}

export function nextIngestId() {
  ingestSerial += 1;
  return `inv_ing_${ingestSerial}`;
}

export function emptyInvoiceTemplate(): Invoice {
  return {
    id: nextIngestId(),
    invoiceNumber: "",
    chargeType: "demurrage",
    direction: "import",
    billingParty: "",
    billingPartyType: "VOCC",
    billedParty: "Northbridge Logistics LLC",
    bolNumber: null,
    containerNumber: "",
    port: null,
    terminal: "",
    liabilityBasis: null,
    invoiceDate: AS_OF_ISO,
    dueDate: null,
    freeTimeDays: null,
    freeTimeStart: null,
    freeTimeEnd: null,
    availabilityDate: null,
    earliestReturnDate: null,
    chargeDates: null,
    amountDue: 0,
    tariffRule: null,
    dailyRate: null,
    contactEmail: null,
    contactPhone: null,
    disputeUrl: null,
    disputeWindowDays: null,
    certFmcConsistent: false,
    certPerformanceClean: false,
    lastChargeDate: AS_OF_ISO,
    holdReason: null,
    status: "open",
    disputeId: null,
    sourceConnector: null,
    sourceFormat: null,
  };
}
