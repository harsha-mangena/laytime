import type { OpenPortCall, TerminalHours } from "./open-types.ts";

function decodeEntities(s: string): string {
  const amp = String.fromCharCode(38);
  return s
    .replace(new RegExp(amp + "quot;", "gi"), '"')
    .replace(new RegExp(amp + "apos;", "gi"), "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(new RegExp(amp + "lt;", "gi"), "<")
    .replace(new RegExp(amp + "gt;", "gi"), ">")
    .replace(new RegExp(amp + "amp;", "gi"), amp);
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNdbcRealtime(text: string): { waveFt: number; wavePeriodSec: number | null } | null {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const wvht = parts[8];
    const dpd = parts[9];
    if (!wvht || wvht === "MM") continue;
    const meters = Number(wvht);
    if (!Number.isFinite(meters)) continue;
    const period = dpd && dpd !== "MM" ? Number(dpd) : null;
    return {
      waveFt: meters * 3.28084,
      wavePeriodSec: period != null && Number.isFinite(period) ? period : null,
    };
  }
  return null;
}

export function parseCwfHarbor(productText: string): string | null {
  const section = productText.match(/ANZ338[\s\S]*?(?=\nANZ\d{3}|\n\$\$|$)/);
  if (!section) return null;
  const today = section[0].match(/\.TODAY\.\.\.[\s\S]*?(?=\n\.[A-Z]|\nANZ|\n\$\$|$)/);
  const night = section[0].match(/\.TONIGHT\.\.\.[\s\S]*?(?=\n\.[A-Z]|\nANZ|\n\$\$|$)/);
  const bits = [today?.[0], night?.[0]].filter(Boolean) as string[];
  if (!bits.length) return section[0].replace(/\s+/g, " ").trim().slice(0, 400);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function callStatus(ata: string | null, atd: string | null): OpenPortCall["status"] {
  if (atd) return "sailed";
  if (ata) return "arrived";
  return "due";
}

function extractJsonValue(source: string, from: number): unknown {
  const s = source.slice(from).trimStart();
  if (s.startsWith("[") || s.startsWith("{")) {
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (escape) {
          escape = false;
          continue;
        }
        if (c === "\\") {
          escape = true;
          continue;
        }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") {
        depth--;
        if (depth === 0) {
          const slice = s.slice(0, i + 1);
          try {
            return JSON.parse(slice);
          } catch {
            try {
              return JSON.parse(decodeEntities(slice));
            } catch {
              return null;
            }
          }
        }
      }
    }
  }
  const encoded = s.match(/^([^"]*)"/);
  if (!encoded) return null;
  try {
    return JSON.parse(decodeEntities(encoded[1]));
  } catch {
    return null;
  }
}

export function parsePnctVessels(html: string): OpenPortCall[] {
  const idAt = html.indexOf('id="divVslSchedules"');
  const dsAt = html.indexOf("data-ds=\"", idAt >= 0 ? idAt : 0);
  if (dsAt < 0) return [];
  const rows = extractJsonValue(html, dsAt + 9);
  if (!Array.isArray(rows)) return [];
  const calls: OpenPortCall[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const vessel = typeof r.VesselName === "string" ? r.VesselName.trim() : "";
    if (!vessel) continue;
    const eta = typeof r.EstimatedArrival === "string" ? r.EstimatedArrival : null;
    const ata = typeof r.Arrival === "string" ? r.Arrival : null;
    const etd = typeof r.EstimatedDeparture === "string" ? r.EstimatedDeparture : null;
    const atd = typeof r.Departure === "string" ? r.Departure : null;
    const voyage = typeof r.IbVoyNumber === "string" ? r.IbVoyNumber : null;
    const cutoff = typeof r.CargoCutoff === "string" ? r.CargoCutoff : null;
    const id =
      typeof r.VisitReference === "string" && r.VisitReference
        ? r.VisitReference
        : `pnct_${vessel}_${voyage ?? calls.length}`;
    calls.push({
      id,
      vessel,
      imo: null,
      mmsi: null,
      port: "PNCT Newark",
      prevPort: null,
      eta,
      ata,
      etd,
      atd,
      voyage,
      cutoff,
      terminal: "PNCT",
      status: callStatus(ata, atd),
      cargo: true,
      typeCode: 70,
    });
  }
  const rank = { arrived: 0, due: 1, sailed: 2 };
  calls.sort((a, b) => {
    const ra = rank[a.status ?? "due"] - rank[b.status ?? "due"];
    if (ra !== 0) return ra;
    return (a.eta ?? "").localeCompare(b.eta ?? "");
  });
  return calls;
}

const HOUR_WINDOWS = [
  "Single Move Import Delivery",
  "Single Move Empty Delivery",
  "Single Move Export Return",
  "Double Moves",
  "Reefer Processing",
  "Hazardous Cargo Receiving",
  "Heavy Lift/Out of Gauge Lifts",
];

export function parsePnctHours(html: string): TerminalHours {
  const text = stripTags(decodeEntities(html));
  const notices: string[] = [];
  const closed = text.match(/[A-Za-z]+,\s*\d{1,2}\/\d{2},?\s*PNCT will be CLOSED/i);
  if (closed) notices.push(closed[0].replace(/\s+/g, " ").trim());
  const last = text.match(/Last truck allowed in queue is ([^.]+)/i);
  const lastTruck = last ? last[1].trim() : null;
  const windows: { label: string; hours: string }[] = [];
  for (const label of HOUR_WINDOWS) {
    const idx = text.indexOf(label);
    if (idx < 0) continue;
    const slice = text.slice(idx + label.length, idx + label.length + 80);
    const hours = slice.match(
      /(\d{1,2}:\d{2}\s*[AP]M\s*-\s*\d{1,2}:\d{2}\s*[AP]M(?:\s+(?:Monday\s*-\s*Friday|Wednesdays ONLY))?)/i,
    );
    if (hours) windows.push({ label, hours: hours[1].replace(/\s+/g, " ").trim() });
  }
  return { terminal: "PNCT", notices, windows, lastTruck };
}
