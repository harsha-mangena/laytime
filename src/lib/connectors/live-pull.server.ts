import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { connectorById } from "./catalog.ts";
import { parseNative } from "./parse.ts";
import { isBlockedIp, parsePublicHttpsUrl, UnsafeUrlError } from "./ssrf.ts";
import type { ConnectorDef, ParseResult } from "./types.ts";

const MAX_BODY = 2 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export { UnsafeUrlError };

async function assertResolvedPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(host) !== 0) {
    if (isBlockedIp(host)) {
      throw new UnsafeUrlError("Endpoint resolves to a private address and was blocked.");
    }
    return;
  }
  let answers: { address: string; family: number }[];
  try {
    answers = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve the vendor host.");
  }
  if (!answers.length) throw new Error("Could not resolve the vendor host.");
  for (const row of answers) {
    if (isBlockedIp(row.address)) {
      throw new UnsafeUrlError("Endpoint resolves to a private address and was blocked.");
    }
  }
}

function vendorHeaders(def: ConnectorDef, account: string, apiKey: string): Headers {
  const headers = new Headers();
  headers.set("Accept", "application/json, application/xml, text/plain, */*");
  headers.set("User-Agent", "Laytime/1.0 (OSRA 541 desk)");
  if (account) headers.set("X-Account", account);
  switch (def.id) {
    case "cargowise":
      headers.set("Authorization", `Basic ${Buffer.from(`${account}:${apiKey}`).toString("base64")}`);
      headers.set("X-API-Key", apiKey);
      break;
    case "maersk":
      headers.set("Consumer-Key", apiKey);
      headers.set("Authorization", `Bearer ${apiKey}`);
      break;
    default:
      headers.set("Authorization", `Bearer ${apiKey}`);
      headers.set("X-API-Key", apiKey);
  }
  return headers;
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403) return `Vendor rejected the credentials (HTTP ${status}).`;
  if (status === 404) return "Vendor endpoint returned 404. Check the URL.";
  if (status === 429) return "Vendor rate-limited the pull. Try again shortly.";
  return `Vendor responded HTTP ${status}.`;
}

async function readBody(res: Response): Promise<string> {
  const declared = res.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY) {
    throw new Error("Vendor response exceeded the 2 MB limit.");
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BODY) {
    throw new Error("Vendor response exceeded the 2 MB limit.");
  }
  return new TextDecoder("utf-8").decode(buf);
}

async function vendorFetch(url: URL, headers: Headers, method: "GET" | "POST"): Promise<Response> {
  try {
    return await fetch(url, {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "Could not reach the vendor.";
    if (name === "TimeoutError" || message.includes("aborted") || message.includes("Timeout")) {
      throw new Error("Vendor did not respond in time.");
    }
    if (name === "AbortError") throw new Error("Vendor did not respond in time.");
    if (/redirect/i.test(message)) {
      throw new Error("Vendor redirected the request; live pulls do not follow redirects.");
    }
    throw new Error("Could not reach the vendor (timeout or DNS).");
  }
}

function asParseInput(body: string): string | unknown {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export async function pullVendorLive(opts: {
  connectorId: string;
  endpoint: string;
  account: string;
  apiKey: string;
}): Promise<ParseResult> {
  const def = connectorById(opts.connectorId);
  if (!def) throw new Error("Unknown connector.");
  if (def.kind === "open") {
    throw new Error("Open data sources are pulled from the public allowlist, not with a vendor key.");
  }
  const key = opts.apiKey.trim();
  if (!key) throw new Error("API key is required for a live connector.");

  const url = parsePublicHttpsUrl(opts.endpoint);
  await assertResolvedPublic(url);

  const headers = vendorHeaders(def, opts.account.trim(), key);
  let res = await vendorFetch(url, headers, "GET");
  if (res.status === 405 || res.status === 501) {
    res = await vendorFetch(url, headers, "POST");
  }
  if (!res.ok) throw new Error(statusMessage(res.status));

  const text = await readBody(res);
  if (!text.trim()) {
    return {
      format: def.format,
      invoices: [],
      gates: [],
      warnings: ["Vendor returned an empty body."],
    };
  }
  try {
    return parseNative(asParseInput(text), {
      format: def.format === "laytime" ? undefined : def.format,
      sourceConnector: def.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not parse the vendor response.";
    if (/Unexpected token|not valid JSON|JSON\.parse|Unrecognized format/i.test(message)) {
      throw new Error(
        "Vendor response was not valid for this adapter. The URL must return this vendor's native format.",
      );
    }
    throw new Error(message);
  }
}
