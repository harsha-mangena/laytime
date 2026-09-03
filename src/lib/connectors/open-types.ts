export interface HarborSnapshot {
  fetchedAt: string;
  tideFt: number | null;
  tideTime: string | null;
  tideStation: string;
  nextTide: { time: string; feet: number; type: "H" | "L" } | null;
  windMph: number | null;
  windDir: string | null;
  gustMph: number | null;
  tempF: number | null;
  windStation: string | null;
  waterTempF?: number | null;
  currentKt?: number | null;
  currentDirDeg?: number | null;
  currentStation?: string | null;
  airGapFt?: number | null;
  airGapStation?: string | null;
  waveFt?: number | null;
  wavePeriodSec?: number | null;
  waveSource?: string | null;
}

export interface OpenTerminal {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
}

export interface OpenPortCall {
  id: string;
  vessel: string;
  imo: string | null;
  mmsi: string | null;
  port: string;
  prevPort: string | null;
  eta: string | null;
  ata: string | null;
  etd?: string | null;
  atd?: string | null;
  voyage?: string | null;
  cutoff?: string | null;
  terminal?: string | null;
  status?: "arrived" | "due" | "sailed" | null;
  cargo: boolean;
  typeCode: number | null;
}

export interface MarineForecast {
  issuedAt: string;
  zone: string;
  headline: string;
  periods: { name: string; text: string }[];
  marine: string | null;
}

export interface WeatherAlert {
  id: string;
  event: string;
  severity: string;
  headline: string;
  ends: string | null;
}

export interface TerminalHours {
  terminal: string;
  notices: string[];
  windows: { label: string; hours: string }[];
  lastTruck: string | null;
}

export interface OpenPull {
  sourceId: string;
  fetchedAt: string;
  harbor?: HarborSnapshot | null;
  terminals?: OpenTerminal[];
  portCalls?: OpenPortCall[];
  vesselCalls?: OpenPortCall[];
  forecast?: MarineForecast | null;
  alerts?: WeatherAlert[];
  gateHours?: TerminalHours | null;
  warnings: string[];
}
