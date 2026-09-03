import {
  parseCwfHarbor,
  parseNdbcRealtime,
  parsePnctHours,
  parsePnctVessels,
} from "./open-parse.ts";
import type {
  HarborSnapshot,
  MarineForecast,
  OpenPortCall,
  OpenPull,
  OpenTerminal,
  WeatherAlert,
} from "./open-types.ts";

const UA = "Laytime/1.0 (OSRA 2022 reconciliation desk; open-data client)";

async function getJson(url: string, extra: HeadersInit = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        ...extra,
      },
    });
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url: string, extra: HeadersInit = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/plain, text/html, application/json",
        "User-Agent": UA,
        ...extra,
      },
    });
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function firstRow(payload: unknown): Record<string, unknown> {
  const data = rec(payload).data;
  return rec((Array.isArray(data) ? data[0] : null) ?? {});
}

async function settled<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export async function pullNoaa(): Promise<OpenPull> {
  const warnings: string[] = [];
  const fetchedAt = new Date().toISOString();
  const tideUrl =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8518750&product=water_level&datum=MLLW&time_zone=gmt&units=english&format=json&application=laytime";
  const hiLoDay = fetchedAt.slice(0, 10).replace(/-/g, "");
  const nextDay = new Date(Date.parse(fetchedAt) + 36 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const predUrl = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${hiLoDay}&end_date=${nextDay}&station=8518750&product=predictions&datum=MLLW&time_zone=gmt&units=english&interval=hilo&format=json&application=laytime`;
  const windUrl =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8531680&product=wind&time_zone=gmt&units=english&format=json&application=laytime";
  const tempUrl =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8531680&product=air_temperature&time_zone=gmt&units=english&format=json&application=laytime";
  const waterUrl =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8518750&product=water_temperature&units=english&time_zone=gmt&format=json&application=laytime";
  const currentUrl =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=n07010&product=currents&time_zone=gmt&units=english&format=json&application=laytime";
  const airGapUrl =
    "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8519461&product=air_gap&time_zone=gmt&units=english&format=json&application=laytime";
  const ndbcUrl = "https://www.ndbc.noaa.gov/data/realtime2/44065.txt";

  const [tide, pred, wind, temp, water, current, airGap, ndbc] = await Promise.all([
    settled(getJson(tideUrl)),
    settled(getJson(predUrl)),
    settled(getJson(windUrl)),
    settled(getJson(tempUrl)),
    settled(getJson(waterUrl)),
    settled(getJson(currentUrl)),
    settled(getJson(airGapUrl)),
    settled(getText(ndbcUrl)),
  ]);

  const tideRow = firstRow(tide);
  const windRow = firstRow(wind);
  const tempRow = firstRow(temp);
  const waterRow = firstRow(water);
  const currentRow = firstRow(current);
  const airGapRow = firstRow(airGap);
  const predictions = Array.isArray(rec(pred).predictions) ? (rec(pred).predictions as unknown[]) : [];
  const now = Date.parse(fetchedAt);
  let nextTide: HarborSnapshot["nextTide"] = null;
  for (const p of predictions) {
    const row = rec(p);
    const t = str(row.t);
    if (!t) continue;
    const ts = Date.parse(t.replace(" ", "T") + "Z");
    if (Number.isFinite(ts) && ts >= now) {
      nextTide = {
        time: t,
        feet: num(row.v) ?? 0,
        type: row.type === "L" ? "L" : "H",
      };
      break;
    }
  }
  if (!tide || rec(tide).error) warnings.push("NOAA Battery water level unavailable.");
  if (!wind || rec(wind).error) warnings.push("NOAA Sandy Hook wind unavailable.");

  const waves = ndbc ? parseNdbcRealtime(ndbc) : null;
  if (!waves) warnings.push("NDBC 44065 seas unavailable.");

  const harbor: HarborSnapshot = {
    fetchedAt,
    tideFt: num(tideRow.v),
    tideTime: str(tideRow.t),
    tideStation: "The Battery, NY (8518750)",
    nextTide,
    windMph: num(windRow.s),
    windDir: str(windRow.dr),
    gustMph: num(windRow.g),
    tempF: num(tempRow.v),
    windStation: "Sandy Hook, NJ (8531680)",
    waterTempF: num(waterRow.v),
    currentKt: num(currentRow.s),
    currentDirDeg: num(currentRow.d),
    currentStation: currentRow.s != null ? "Newark Bay entrance (n07010)" : null,
    airGapFt: num(airGapRow.v),
    airGapStation: airGapRow.v != null ? "Bayonne Bridge (8519461)" : null,
    waveFt: waves?.waveFt ?? null,
    wavePeriodSec: waves?.wavePeriodSec ?? null,
    waveSource: waves ? "NDBC 44065 Harbor Entrance" : null,
  };

  return { sourceId: "noaa-nynj", fetchedAt, harbor, warnings };
}

export async function pullOsm(): Promise<OpenPull> {
  const fetchedAt = new Date().toISOString();
  const queries = [
    "APM Terminals Elizabeth NJ",
    "Maher Terminals Elizabeth NJ",
    "Port Newark Container Terminal",
  ];
  const terminals: OpenTerminal[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const rows = await getJson(url);
    const list = Array.isArray(rows) ? rows : [];
    const row = rec(list[0]);
    const name = str(row.name) ?? q.replace(" NJ", "");
    const lat = num(row.lat);
    const lon = num(row.lon);
    if (lat == null || lon == null) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terminals.push({
      id: `osm_${row.osm_type}_${row.osm_id}`,
      name,
      lat,
      lon,
      address: str(row.display_name),
    });
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (terminals.length) {
    return { sourceId: "osm-nynj", fetchedAt, terminals, warnings: [] };
  }
  try {
    return await pullOsmOverpass();
  } catch {
    return {
      sourceId: "osm-nynj",
      fetchedAt,
      terminals: [],
      warnings: ["Could not reach OpenStreetMap."],
    };
  }
}

async function pullOsmOverpass(): Promise<OpenPull> {
  const fetchedAt = new Date().toISOString();
  const query = `[out:json][timeout:12];
(
  nwr["name"~"APM Terminals"](40.60,-74.22,40.75,-74.05);
  nwr["name"~"Maher Terminals"](40.60,-74.22,40.75,-74.05);
  nwr["name"~"Port Newark Container"](40.60,-74.22,40.75,-74.05);
);
out center 16;`;
  const body = new URLSearchParams({ data: query }).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14000);
  let elements: unknown[] = [];
  try {
    const res = await fetch("https://overpass.kumi.systems/api/interpreter", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
        "User-Agent": UA,
      },
      body,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = rec(await res.json());
    elements = Array.isArray(json.elements) ? (json.elements as unknown[]) : [];
  } finally {
    clearTimeout(timer);
  }

  const seen = new Set<string>();
  const terminals: OpenTerminal[] = [];
  for (const el of elements) {
    const e = rec(el);
    const tags = rec(e.tags);
    const name = str(tags.name);
    if (!name) continue;
    const center = rec(e.center);
    const lat = num(e.lat) ?? num(center.lat);
    const lon = num(e.lon) ?? num(center.lon);
    if (lat == null || lon == null) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const address = [str(tags["addr:housenumber"]), str(tags["addr:street"]), str(tags["addr:city"])]
      .filter(Boolean)
      .join(" ");
    terminals.push({
      id: `osm_${e.type}_${e.id}`,
      name,
      lat,
      lon,
      address: address || null,
    });
  }

  return {
    sourceId: "osm-nynj",
    fetchedAt,
    terminals,
    warnings: terminals.length ? [] : ["Overpass returned no NY/NJ terminals."],
  };
}

const TYPE_CARGO = 70;

export async function pullDigitraffic(): Promise<OpenPull> {
  const fetchedAt = new Date().toISOString();
  const raw = rec(
    await getJson("https://meri.digitraffic.fi/api/port-call/v1/port-calls", {
      "Accept-Encoding": "gzip",
    }),
  );
  const calls = Array.isArray(raw.portCalls) ? (raw.portCalls as unknown[]) : [];
  const portCalls: OpenPortCall[] = [];
  for (const item of calls) {
    const c = rec(item);
    const typeCode = num(c.vesselTypeCode);
    if (typeCode !== TYPE_CARGO) continue;
    const areas = Array.isArray(c.portAreaDetails) ? (c.portAreaDetails as unknown[]) : [];
    const area = rec(areas[0]);
    portCalls.push({
      id: `pc_${c.portCallId ?? c.imoLloyds ?? portCalls.length}`,
      vessel: str(c.vesselName) ?? "Unknown vessel",
      imo: c.imoLloyds != null ? String(c.imoLloyds) : null,
      mmsi: c.mmsi != null ? String(c.mmsi) : null,
      port: str(c.portToVisit) ?? "—",
      prevPort: str(c.prevPort),
      eta: str(area.eta) ?? str(c.portCallTimestamp),
      ata: str(area.ata),
      cargo: c.arrivalWithCargo === true || c.discharge === 1,
      typeCode,
    });
  }
  portCalls.sort((a, b) => (b.eta ?? "").localeCompare(a.eta ?? ""));
  return {
    sourceId: "digitraffic",
    fetchedAt,
    portCalls: portCalls.slice(0, 24),
    warnings: portCalls.length ? [] : ["No cargo port calls in the Fintraffic feed."],
  };
}

export async function pullNws(): Promise<OpenPull> {
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const [forecastJson, alertsJson, productsJson] = await Promise.all([
    settled(getJson("https://api.weather.gov/gridpoints/OKX/29,39/forecast")),
    settled(getJson("https://api.weather.gov/alerts/active?area=NJ")),
    settled(getJson("https://api.weather.gov/products/types/CWF/locations/OKX")),
  ]);

  const periodsRaw = Array.isArray(rec(rec(forecastJson).properties).periods)
    ? (rec(rec(forecastJson).properties).periods as unknown[])
    : [];
  const periods = periodsRaw.slice(0, 4).map((p) => {
    const row = rec(p);
    return {
      name: str(row.name) ?? "Period",
      text: str(row.detailedForecast) ?? str(row.shortForecast) ?? "",
    };
  });
  if (!periods.length) warnings.push("NWS Elizabeth forecast unavailable.");

  const alerts: WeatherAlert[] = [];
  const seenEvents = new Set<string>();
  const features = Array.isArray(rec(alertsJson).features) ? (rec(alertsJson).features as unknown[]) : [];
  for (const f of features) {
    const p = rec(rec(f).properties);
    const event = str(p.event);
    if (!event || seenEvents.has(event)) continue;
    seenEvents.add(event);
    alerts.push({
      id: str(p.id) ?? `nws_${alerts.length}`,
      event,
      severity: str(p.severity) ?? "Unknown",
      headline: str(p.headline) ?? event,
      ends: str(p.ends) ?? str(p.expires),
    });
    if (alerts.length >= 6) break;
  }

  let marine: string | null = null;
  const graph = Array.isArray(rec(productsJson)["@graph"])
    ? (rec(productsJson)["@graph"] as unknown[])
    : [];
  const productId = str(rec(graph[0]).id);
  if (productId) {
    const product = await settled(getJson(`https://api.weather.gov/products/${productId}`));
    marine = parseCwfHarbor(str(rec(product).productText) ?? "");
  }
  if (!marine) warnings.push("Coastal waters forecast for ANZ338 unavailable.");

  const forecast: MarineForecast | null = periods.length
    ? {
        issuedAt: str(rec(rec(forecastJson).properties).updateTime) ?? fetchedAt,
        zone: "OKX / ANZ338 New York Harbor",
        headline: periods[0] ? `${periods[0].name} · ${periods[0].text.split(".")[0]}` : "NWS NY Harbor",
        periods,
        marine,
      }
    : marine
      ? {
          issuedAt: fetchedAt,
          zone: "ANZ338 New York Harbor",
          headline: marine.slice(0, 140),
          periods: [],
          marine,
        }
      : null;

  return {
    sourceId: "nws-nynj",
    fetchedAt,
    forecast,
    alerts,
    warnings,
  };
}

export async function pullPnct(): Promise<OpenPull> {
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const [scheduleHtml, hoursHtml] = await Promise.all([
    settled(getText("https://www.pnct.net/VesselSchedule")),
    settled(getText("https://www.pnct.net/content/show/GateHours")),
  ]);
  const vesselCalls = scheduleHtml ? parsePnctVessels(scheduleHtml) : [];
  if (!vesselCalls.length) warnings.push("PNCT vessel board was empty or blocked.");
  const gateHours = hoursHtml ? parsePnctHours(hoursHtml) : null;
  if (!gateHours || (!gateHours.windows.length && !gateHours.notices.length)) {
    warnings.push("PNCT gate hours could not be parsed.");
  }
  return {
    sourceId: "pnct-public",
    fetchedAt,
    vesselCalls,
    gateHours: gateHours?.windows.length || gateHours?.notices.length ? gateHours : null,
    warnings,
  };
}

export async function pullOpen(sourceId: string): Promise<OpenPull> {
  if (sourceId === "noaa-nynj") return pullNoaa();
  if (sourceId === "osm-nynj") return pullOsm();
  if (sourceId === "digitraffic") return pullDigitraffic();
  if (sourceId === "nws-nynj") return pullNws();
  if (sourceId === "pnct-public") return pullPnct();
  throw new Error(`No live public feed for ${sourceId}.`);
}
