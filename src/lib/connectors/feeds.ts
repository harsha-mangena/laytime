import { addDays, format, subDays } from "date-fns";
import { AS_OF } from "../as-of.ts";
import { parseNative } from "./parse.ts";
import type { NativeFormat, ParseResult } from "./types.ts";

function day(offset: number) {
  return format(addDays(AS_OF, offset), "yyyy-MM-dd");
}
function ago(n: number) {
  return format(subDays(AS_OF, n), "yyyy-MM-dd");
}
function x12(n: number) {
  return format(subDays(AS_OF, n), "yyMMdd");
}
function stamp(n: number, h: number, m = 0) {
  const d = subDays(AS_OF, n);
  return `${format(d, "yyyy-MM-dd")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}
function edifactTime(n: number, h: number, m = 0) {
  const d = subDays(AS_OF, n);
  return `${format(d, "yyyyMMdd")}${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

/** Shared box used to prove TMS lag once CargoWise + APM are both synced. */
export const LAG_CONTAINER = "TCLU8811002";
export const LAG_INVOICE = "MSC-DND-99102";

export const FEEDS = {
  cargowise: {
    format: "cargowise",
    body: JSON.stringify(
      {
        UniversalShipment: {
          Shipment: {
            WayBillNumber: "MEDUUN26099102",
            CarrierName: "MSC Mediterranean Shipping",
            PortOfDischarge: "New York / New Jersey",
            LocalClientName: "Northbridge Logistics LLC",
            ContainerCollection: {
              Container: [
                {
                  ContainerNumber: LAG_CONTAINER,
                  ArrivalLocation: "APM Terminals Elizabeth",
                  ArrivalPort: "New York / New Jersey",
                  FreeTimeDays: 4,
                  InvoiceNumber: LAG_INVOICE,
                  OutstandingDnd: 9920,
                  DateCollection: {
                    Date: [
                      { Type: "Discharge", Value: ago(16) },
                      { Type: "Available", Value: ago(15) },
                      { Type: "FreeTimeStart", Value: ago(16) },
                      { Type: "FreeTimeEnd", Value: ago(12) },
                    ],
                  },
                },
                {
                  ContainerNumber: "HMMU4412098",
                  ArrivalLocation: "APM Terminals Elizabeth",
                  ArrivalPort: "New York / New Jersey",
                  FreeTimeDays: 4,
                  InvoiceNumber: "HMM-CW-10441",
                  OutstandingDnd: 6400,
                  DateCollection: {
                    Date: [
                      { Type: "Available", Value: ago(11) },
                      { Type: "FreeTimeStart", Value: ago(11) },
                    ],
                  },
                },
              ],
            },
            JobCosting: {
              Charge: [
                {
                  ChargeCode: "DEM",
                  Description: "Demurrage NY/NJ",
                  InvoiceNumber: LAG_INVOICE,
                  InvoiceDate: ago(10),
                  DueDate: day(20),
                  Amount: 9920,
                  Rate: 2480,
                  Equipment: LAG_CONTAINER,
                  Creditor: "MSC Mediterranean Shipping",
                  ContactEmail: "dnd.us@msc.com",
                  ContactPhone: "+1 212 764 4800",
                  DisputeUrl: "https://www.msc.com/usa/help-centre/demurrage-detention",
                  CertFmcConsistent: false,
                  CertPerformanceClean: false,
                },
                {
                  ChargeCode: "DEM",
                  Description: "HMM demurrage via CW1",
                  InvoiceNumber: "HMM-CW-10441",
                  InvoiceDate: ago(6),
                  DueDate: day(24),
                  Amount: 6400,
                  Rate: 1600,
                  Equipment: "HMMU4412098",
                  Creditor: "HMM",
                  CertFmcConsistent: true,
                  CertPerformanceClean: true,
                },
              ],
            },
          },
        },
      },
      null,
      2,
    ),
  },
  tango: {
    format: "tango",
    body: JSON.stringify(
      {
        sourceSystem: "Tango",
        company: "NBL-NYNJ",
        loads: [
          {
            proNumber: "YMLU-TG-77210",
            container: "YMLU7721094",
            bol: "YMLUNYC2607721",
            carrier: "Yang Ming",
            billTo: "Northbridge Logistics LLC",
            direction: "import",
            port: "New York / New Jersey",
            terminal: "PNCT",
            freeTimeDays: 4,
            freeTimeStart: ago(14),
            freeTimeEnd: ago(10),
            availabilityDate: ago(14),
            contactEmail: "us.dnd@yangming.com",
            contactPhone: "+1 201 222 8899",
            disputeUrl: "https://www.yangming.com/dnd",
            certFmcConsistent: true,
            certPerformanceClean: false,
            accessorials: [
              {
                code: "DET",
                amount: 5400,
                rate: 1800,
                invoiceNumber: "YMLU-TG-77210",
                invoiceDate: ago(8),
                dueDate: day(22),
                lastChargeDate: ago(9),
              },
            ],
            milestones: [
              { code: "discharge", at: stamp(14, 5, 12), notes: "Tango vessel AIS" },
              { code: "available", at: stamp(13, 9, 40), notes: "Tango availability ping — 18h after PNCT" },
            ],
          },
        ],
      },
      null,
      2,
    ),
  },
  msc: {
    format: "msc",
    body: JSON.stringify(
      {
        invoices: [
          {
            invoiceNumber: LAG_INVOICE,
            invoiceNo: LAG_INVOICE,
            chargeType: "demurrage",
            issuer: "MSC Mediterranean Shipping",
            payer: "Northbridge Logistics LLC",
            blNumber: "MEDUUN26099102",
            portOfDischarge: "New York / New Jersey",
            terminal: "APM Terminals Elizabeth",
            liabilityBasis: "Consignee named on bill of lading MEDUUN26099102.",
            invoiceDate: ago(10),
            dueDate: day(20),
            freeTimeDays: 4,
            freeTimeStart: ago(16),
            freeTimeEnd: ago(12),
            availabilityDate: ago(16),
            chargeDates: [ago(11), ago(10), ago(9), ago(8)],
            amountDue: 9920,
            dailyRate: 2480,
            tariffRule: "MSC Rule Tariff 004 — Demurrage NY/NJ",
            contactEmail: "dnd.us@msc.com",
            contactPhone: "+1 212 764 4800",
            disputeUrl: "https://www.msc.com/usa/help-centre/demurrage-detention",
            disputeWindowDays: 30,
            certFmcConsistent: false,
            certPerformanceClean: false,
            lastChargeDate: ago(8),
            containers: [{ cntrNo: LAG_CONTAINER, terminal: "APM Terminals Elizabeth" }],
          },
        ],
      },
      null,
      2,
    ),
  },
  maersk: {
    format: "maersk",
    body: JSON.stringify(
      {
        invoices: [
          {
            invoiceNumber: "MAEU-DT-773301",
            issuer: "Maersk A/S",
            payerName: "Northbridge Logistics LLC",
            transportDocumentReference: "MAEU7733012291",
            unLocationName: "New York / New Jersey",
            facility: "Maher Terminals",
            invoiceDate: ago(9),
            paymentDueDate: day(21),
            freeTime: 5,
            freeTimeStart: ago(20),
            freeTimeEnd: ago(15),
            cargoAvailabilityDate: ago(20),
            earliestReturnDate: ago(15),
            totalAmount: 8750,
            dailyRate: 1750,
            tariff: "Maersk Detention Tariff USEC 2.4",
            contactEmail: "us.detention@maersk.com",
            contactPhone: "+1 973 514 5000",
            disputeUrl: "https://www.maersk.com/support/demurrage-detention",
            certFmcConsistent: true,
            certPerformanceClean: true,
            lastChargeDate: ago(12),
            chargeType: "detention",
            equipment: [{ equipmentReference: "MAEU7733012", freeTime: 5, availabilityDate: ago(20) }],
            charges: [{ code: "DET", amount: 8750, rate: 1750, tariff: "Maersk Detention Tariff USEC 2.4" }],
          },
        ],
      },
      null,
      2,
    ),
  },
  cma: {
    format: "edi310",
    body: [
      "ISA*00*          *00*          *ZZ*CMA CGM         *ZZ*NORTHBRIDGE     *" + x12(7) + "*1411*U*00401*000000901*0*P*>",
      "GS*IM*CMACGM*NORTHBRIDGE*" + format(subDays(AS_OF, 7), "yyyyMMdd") + "*1411*901*X*004010",
      "ST*310*0001",
      "B3*M*CMA551902**CMDUUSNYC2601902*PP*" + x12(7) + "*8100*CMA**USD*****CMDU",
      "N9*BM*CMDUUSNYC2601902",
      "N9*CN*CMAU5519028",
      "N1*CA*CMA CGM",
      "N1*CN*NORTHBRIDGE LOGISTICS LLC",
      "R4*D*UN*USNYC*NEW YORK / NEW JERSEY",
      "R4*L*UN*USNYC*WBCT",
      "DTM*007*" + x12(7),
      "DTM*140*" + x12(18),
      "DTM*196*" + x12(18),
      "LX*1",
      "L1*1*2700*PD*8100****DEM",
      "SE*14*0001",
      "GE*1*901",
      "IEA*1*000000901",
    ].join("\n"),
  },
  apm: {
    format: "tos",
    body: JSON.stringify(
      {
        terminal: "APM Terminals Elizabeth",
        facility: "APMT-EWR",
        events: [
          {
            container: LAG_CONTAINER,
            move: "DISCHARGE",
            eventTime: stamp(16, 4, 18),
            yard: "4E-12",
            notes: "Vessel MSC FAITH / 4E",
          },
          {
            container: LAG_CONTAINER,
            move: "AVAILABLE",
            eventTime: stamp(16, 18, 40),
            yard: "4E-12",
            notes: "Customs released. Yard available.",
          },
          {
            container: "HMMU4412098",
            move: "DISCHARGE",
            eventTime: stamp(12, 3, 55),
            yard: "2N-08",
          },
          {
            container: "HMMU4412098",
            move: "AVAILABLE",
            eventTime: stamp(12, 11, 20),
            yard: "2N-08",
            notes: "Available 22h before CargoWise ping.",
          },
        ],
      },
      null,
      2,
    ),
  },
  maher: {
    format: "codeco",
    body: [
      "UNB+UNOA:2+MAHER+NORTHBRIDGE+" + format(subDays(AS_OF, 19), "yyMMdd") + ":0600+1'",
      "UNH+1+CODECO:D:95B:UN'",
      "BGM+265+MAHER-GATE-7733+9'",
      "NAD+MS+Maher Terminals'",
      "EQD+CN+MAEU7733012+45G1'",
      "DTM+7:" + edifactTime(19, 6, 12) + ":203'",
      "LOC+165+Maher Terminals'",
      "CNT+16:1'",
      "UNT+8+1'",
      "UNH+2+CODECO:D:95B:UN'",
      "BGM+98+MAHER-AVAIL-7733+9'",
      "NAD+MS+Maher Terminals'",
      "EQD+CN+MAEU7733012+45G1'",
      "DTM+7:" + edifactTime(19, 16, 48) + ":203'",
      "LOC+165+Maher Terminals'",
      "CNT+16:1'",
      "UNT+8+2'",
      "UNH+3+CODECO:D:95B:UN'",
      "BGM+34+MAHER-OUT-7733+9'",
      "NAD+MS+Maher Terminals'",
      "EQD+CN+MAEU7733012+45G1'",
      "DTM+7:" + edifactTime(14, 13, 5) + ":203'",
      "LOC+165+Maher Terminals'",
      "CNT+16:1'",
      "UNT+8+3'",
      "UNZ+1+1'",
    ].join("\n"),
  },
  pnct: {
    format: "tos",
    body: JSON.stringify(
      {
        terminal: "PNCT",
        facility: "PNCT-EWR",
        events: [
          {
            container: "YMLU7721094",
            move: "DISCHARGE",
            eventTime: stamp(14, 2, 40),
            yard: "A3",
            notes: "Yang Ming / PNCT",
          },
          {
            container: "YMLU7721094",
            move: "AVAILABLE",
            eventTime: stamp(14, 15, 10),
            yard: "A3",
            notes: "Available 18h before Tango ping.",
          },
        ],
      },
      null,
      2,
    ),
  },
};

export function feedFor(connectorId: string): ParseResult {
  const feed = FEEDS[connectorId as keyof typeof FEEDS];
  if (!feed) {
    return { format: "laytime", invoices: [], gates: [], warnings: ["No sandbox feed for this connector."] };
  }
  return parseNative(feed.body, { format: feed.format as NativeFormat, sourceConnector: connectorId });
}

export function sampleBody(connectorId: string) {
  return FEEDS[connectorId as keyof typeof FEEDS]?.body ?? "";
}
