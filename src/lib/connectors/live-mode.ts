import type { ConnectorDef } from "./types.ts";

/** Client-side: catalog sandbox URL + catalog sandbox token = planted feed. Anything else is a live attempt. */
export function isLiveAttempt(def: ConnectorDef, endpoint: string, apiKey: string): boolean {
  if (def.kind === "open") return false;
  const ep = endpoint.trim();
  const key = apiKey.trim();
  if (!ep) return false;
  if (ep.toLowerCase().startsWith("edi://")) return false;
  let userHost = "";
  let catalogHost = "";
  try {
    userHost = new URL(ep).hostname.toLowerCase();
  } catch {
    return true;
  }
  try {
    catalogHost = new URL(def.endpoint).hostname.toLowerCase();
  } catch {
    catalogHost = "";
  }
  if (userHost && catalogHost && userHost !== catalogHost) return true;
  if (key && key !== def.sandboxKey) return true;
  return false;
}
