import type { GateEvent, Invoice } from "@/lib/types";

export type ConnectorKind = "tms" | "carrier" | "terminal" | "open";
export type ConnectorStatus = "disconnected" | "connected" | "syncing" | "error";

export type NativeFormat =
  | "laytime"
  | "cargowise"
  | "tango"
  | "edi310"
  | "codeco"
  | "tos"
  | "maersk"
  | "msc"
  | "cma"
  | "noaa"
  | "osm"
  | "digitraffic"
  | "nws"
  | "pnct";

export interface ConnectorDef {
  id: string;
  name: string;
  vendor: string;
  kind: ConnectorKind;
  protocol: string;
  format: NativeFormat;
  blurb: string;
  endpoint: string;
  accountLabel: string;
  sandboxAccount: string;
  sandboxKey: string;
}

export interface Connection {
  connectorId: string;
  status: ConnectorStatus;
  account: string;
  endpoint: string;
  connectedAt: string;
  lastSyncAt: string | null;
  lastError: string | null;
  invoicesPulled: number;
  gatesPulled: number;
  mode: "sandbox" | "live";
  hasKey: boolean;
}

export interface SyncJob {
  id: string;
  connectorId: string;
  at: string;
  format: NativeFormat;
  invoices: number;
  gates: number;
  addedInvoices: number;
  addedGates: number;
  warnings: string[];
}

export interface ParseResult {
  format: NativeFormat;
  invoices: Invoice[];
  gates: GateEvent[];
  warnings: string[];
}
