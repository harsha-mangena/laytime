export type ChargeType = "demurrage" | "detention";
export type Direction = "import" | "export";
export type InvoiceStatus = "open" | "disputed" | "recovered" | "paid";
export type GateEventType =
  | "discharge"
  | "available"
  | "outgate"
  | "ingate"
  | "empty_return"
  | "hold";
export type CheckCategory =
  | "identifying"
  | "timing"
  | "rate"
  | "dispute_info"
  | "certification"
  | "issuance"
  | "accuracy"
  | "incentive";
export type CheckSeverity = "void" | "dispute" | "info";
export type ClockStatus = "ok" | "warning" | "critical" | "expired";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  chargeType: ChargeType;
  direction: Direction;
  billingParty: string;
  billingPartyType: "VOCC" | "NVOCC" | "MTO";
  billedParty: string;
  bolNumber: string | null;
  containerNumber: string;
  port: string | null;
  terminal: string;
  liabilityBasis: string | null;
  invoiceDate: string;
  dueDate: string | null;
  freeTimeDays: number | null;
  freeTimeStart: string | null;
  freeTimeEnd: string | null;
  availabilityDate: string | null;
  earliestReturnDate: string | null;
  chargeDates: string[] | null;
  amountDue: number;
  tariffRule: string | null;
  dailyRate: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  disputeUrl: string | null;
  disputeWindowDays: number | null;
  certFmcConsistent: boolean;
  certPerformanceClean: boolean;
  lastChargeDate: string;
  holdReason: string | null;
  status: InvoiceStatus;
  disputeId: string | null;
  sourceConnector?: string | null;
  sourceFormat?: string | null;
}

export interface GateEvent {
  id: string;
  containerNumber: string;
  terminal: string;
  eventType: GateEventType;
  timestamp: string;
  source: "terminal" | "tms" | "carrier";
  notes: string | null;
}

export interface OsraCheck {
  code: string;
  label: string;
  category: CheckCategory;
  passed: boolean;
  severity: CheckSeverity;
  detail: string;
}

export interface ScanResult {
  invoiceId: string;
  obligationToPay: boolean;
  voidable: boolean;
  score: number;
  checks: OsraCheck[];
  failedVoid: OsraCheck[];
  failedDispute: OsraCheck[];
  recoverableAmount: number;
  disputeDeadline: string | null;
  daysRemaining: number | null;
  clock: ClockStatus;
  tmsLagHours: number | null;
  recommendedAction: "pay" | "dispute" | "void_notice" | "clock_expired";
}

export interface DisputeRecord {
  id: string;
  invoiceId: string;
  createdAt: string;
  grounds: string[];
  letter: string;
  status: "draft" | "sent" | "accepted" | "denied";
  deadline: string;
}

export interface ScanPayload {
  invoice: Partial<Invoice> & {
    invoiceNumber?: string;
    containerNumber?: string;
    amountDue?: number;
    chargeType?: ChargeType;
  };
  gates?: GateEvent[];
}
