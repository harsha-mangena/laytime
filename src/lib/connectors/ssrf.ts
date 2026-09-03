import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function parseV4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const oct: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    oct.push(n);
  }
  return oct;
}

/** True for loopback, RFC1918, link-local, ULA, multicast, unspecified, IPv4-mapped privates. */
export function isBlockedIp(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (!ip) return true;

  if (ip.startsWith("::ffff:")) {
    return isBlockedIp(ip.slice("::ffff:".length));
  }

  const v4 = parseV4(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;
    return false;
  }

  if (isIP(ip) !== 6 && !ip.includes(":")) return true;

  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("ff")) return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) {
    return true;
  }
  // Unique local fc00::/7
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

function hostLooksLocal(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOSTS.has(`${host}.`)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "ip6-localhost" || host === "ip6-loopback") return true;
  return false;
}

/**
 * Parse a user-supplied vendor URL. HTTPS only, no credentials, no local/metadata hosts.
 * IP literals are checked here; hostnames still need a DNS pass on the server.
 */
export function parsePublicHttpsUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new UnsafeUrlError("Endpoint is required.");
  if (trimmed.toLowerCase().startsWith("edi://")) {
    throw new UnsafeUrlError("EDI mailbox URLs cannot be pulled live. Use HTTPS, or drop the 310/CODECO on Ingest.");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UnsafeUrlError("Endpoint is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeUrlError("Live connectors must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Do not put credentials in the URL. Use the API key field.");
  }
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (!host) throw new UnsafeUrlError("Endpoint is missing a host.");
  if (hostLooksLocal(host)) {
    throw new UnsafeUrlError("That host is not allowed for live pulls.");
  }
  if (isIP(host) !== 0 || parseV4(host)) {
    if (isBlockedIp(host)) {
      throw new UnsafeUrlError("Endpoint resolves to a private address and was blocked.");
    }
  }
  return url;
}
