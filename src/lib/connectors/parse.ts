import { parseCodeco, parseEdi310 } from "./edi.ts";
import {
  detectJsonFormat,
  parseCargowise,
  parseCmaJson,
  parseLaytime,
  parseMaersk,
  parseMsc,
  parseTango,
  parseTos,
} from "./json-native.ts";
import type { NativeFormat, ParseResult } from "./types.ts";

export function detectFormat(input: string | unknown): NativeFormat {
  if (typeof input !== "string") return detectJsonFormat(input);
  const t = input.trim();
  if (!t) throw new Error("Empty payload.");
  if (t.startsWith("ISA")) return "edi310";
  if (t.startsWith("UNB") || t.startsWith("UNH") || t.includes("+CODECO:")) return "codeco";
  if (t.startsWith("{") || t.startsWith("[")) {
    return detectJsonFormat(JSON.parse(t) as unknown);
  }
  if (t.includes("ST*310")) return "edi310";
  throw new Error(
    "Unrecognized format. Send X12 310, CODECO, CargoWise UniversalShipment, Tango, TOS JSON, or a Laytime envelope.",
  );
}

export function parseNative(
  input: string | unknown,
  opts?: { format?: NativeFormat; sourceConnector?: string },
): ParseResult {
  const format = opts?.format ?? detectFormat(input);
  const source = opts?.sourceConnector;
  const raw =
    typeof input === "string" && (format !== "edi310" && format !== "codeco")
      ? (JSON.parse(input) as unknown)
      : input;

  switch (format) {
    case "edi310":
      if (typeof raw !== "string") throw new Error("EDI 310 must be X12 text.");
      return parseEdi310(raw, source ?? "cma");
    case "codeco":
      if (typeof raw !== "string") throw new Error("CODECO must be EDIFACT text.");
      return parseCodeco(raw, source ?? "maher");
    case "cargowise":
      return parseCargowise(raw, source ?? "cargowise");
    case "tango":
      return parseTango(raw, source ?? "tango");
    case "msc":
      return parseMsc(raw, source ?? "msc");
    case "maersk":
      return parseMaersk(raw, source ?? "maersk");
    case "cma":
      return parseCmaJson(raw, source ?? "cma");
    case "tos":
      return parseTos(raw, source ?? "apm");
    default:
      return parseLaytime(raw, source);
  }
}

export function formatLabel(format: NativeFormat) {
  const labels: Record<NativeFormat, string> = {
    laytime: "Laytime JSON",
    cargowise: "CargoWise UniversalShipment",
    tango: "Tango TMS",
    edi310: "X12 310",
    codeco: "EDIFACT CODECO",
    tos: "TOS gate JSON",
    maersk: "Maersk invoice JSON",
    msc: "MSC invoice JSON",
    cma: "CMA CGM JSON",
    noaa: "NOAA CO-OPS",
    osm: "OpenStreetMap Overpass",
    digitraffic: "Fintraffic Portnet",
    nws: "NWS api.weather.gov",
    pnct: "PNCT public board",
  };
  return labels[format];
}
