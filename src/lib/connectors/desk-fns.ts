import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectorById } from "./catalog.ts";
import { isLiveAttempt } from "./live-mode.ts";
import type { Connection } from "./types.ts";
import type { GateEvent, Invoice } from "@/lib/types";

export type PublicConnection = Connection;

export type PullPayload = {
  ok: boolean;
  error: string | null;
  mode: "sandbox" | "live";
  connection: PublicConnection;
  invoices: Invoice[];
  gates: GateEvent[];
  warnings: string[];
};

type ConnectionRow = {
  connector_id: string;
  account: string;
  endpoint: string;
  mode: string;
  status: string;
  last_sync_at: Date | string | null;
  last_error: string | null;
  invoices_pulled: number;
  gates_pulled: number;
  connected_at: Date | string;
  has_key: boolean;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function toPublic(row: ConnectionRow): PublicConnection {
  const mode = row.mode === "live" ? "live" : "sandbox";
  const status =
    row.status === "syncing" || row.status === "error" || row.status === "disconnected"
      ? row.status
      : "connected";
  return {
    connectorId: row.connector_id,
    status,
    account: row.account,
    endpoint: row.endpoint,
    connectedAt: iso(row.connected_at) ?? new Date().toISOString(),
    lastSyncAt: iso(row.last_sync_at),
    lastError: row.last_error,
    invoicesPulled: Number(row.invoices_pulled) || 0,
    gatesPulled: Number(row.gates_pulled) || 0,
    mode,
    hasKey: Boolean(row.has_key),
  };
}

async function readConnection(userId: string, connectorId: string): Promise<PublicConnection | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<ConnectionRow>`
    select connector_id, account, endpoint, mode, status, last_sync_at, last_error,
           invoices_pulled, gates_pulled, connected_at,
           (api_key is not null and api_key <> '') as has_key
    from connections
    where user_id = ${userId} and connector_id = ${connectorId}
  `;
  return rows[0] ? toPublic(rows[0]) : null;
}

async function upsertConnection(opts: {
  userId: string;
  connectorId: string;
  account: string;
  endpoint: string;
  mode: "sandbox" | "live";
  apiKey: string | null;
}): Promise<PublicConnection> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const key = opts.mode === "live" && opts.apiKey ? opts.apiKey : null;
  await sql`
    insert into connections (user_id, connector_id, account, endpoint, api_key, mode, status, last_error)
    values (
      ${opts.userId},
      ${opts.connectorId},
      ${opts.account},
      ${opts.endpoint},
      ${key},
      ${opts.mode},
      'connected',
      null
    )
    on conflict (user_id, connector_id) do update set
      account = excluded.account,
      endpoint = excluded.endpoint,
      api_key = excluded.api_key,
      mode = excluded.mode,
      status = 'connected',
      last_error = null
  `;
  const row = await readConnection(opts.userId, opts.connectorId);
  if (!row) throw new Error("Failed to store the connection.");
  return row;
}

async function markPull(
  userId: string,
  connectorId: string,
  patch: { ok: boolean; error: string | null; invoices: number; gates: number; warnings: string[] },
): Promise<PublicConnection> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const status = patch.ok ? "connected" : "error";
  const lastError = patch.error ?? patch.warnings[0] ?? null;
  if (patch.ok) {
    await sql`
      update connections
      set status = ${status},
          last_sync_at = now(),
          last_error = ${lastError},
          invoices_pulled = ${patch.invoices},
          gates_pulled = ${patch.gates}
      where user_id = ${userId} and connector_id = ${connectorId}
    `;
  } else {
    await sql`
      update connections
      set status = ${status},
          last_error = ${lastError}
      where user_id = ${userId} and connector_id = ${connectorId}
    `;
  }
  const row = await readConnection(userId, connectorId);
  if (!row) throw new Error("Connection missing after pull.");
  return row;
}

export const listConnections = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PublicConnection[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<ConnectionRow>`
      select connector_id, account, endpoint, mode, status, last_sync_at, last_error,
             invoices_pulled, gates_pulled, connected_at,
             (api_key is not null and api_key <> '') as has_key
      from connections
      where user_id = ${context.userId}
      order by connected_at desc
    `;
    return rows.map(toPublic);
  });

export const disconnectConnector = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((connectorId: string) => connectorId.trim())
  .handler(async ({ context, data: connectorId }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from connections where user_id = ${context.userId} and connector_id = ${connectorId}`;
    return { ok: true as const };
  });

type SaveInput = {
  connectorId: string;
  account: string;
  endpoint: string;
  apiKey: string;
};

function validateSave(input: SaveInput): SaveInput {
  if (!input || typeof input.connectorId !== "string") throw new Error("Invalid connector.");
  const connectorId = input.connectorId.trim();
  const account = String(input.account ?? "").trim();
  const endpoint = String(input.endpoint ?? "").trim();
  const apiKey = String(input.apiKey ?? "").trim();
  if (!connectorId) throw new Error("Invalid connector.");
  if (apiKey.length > 4096) throw new Error("API key is too long.");
  if (endpoint.length > 2048) throw new Error("Endpoint is too long.");
  return { connectorId, account, endpoint, apiKey };
}

async function runLivePull(opts: {
  userId: string;
  connectorId: string;
  endpoint: string;
  account: string;
  apiKey: string;
}): Promise<PullPayload> {
  const { pullVendorLive } = await import("./live-pull.server.ts");
  try {
    const parsed = await pullVendorLive({
      connectorId: opts.connectorId,
      endpoint: opts.endpoint,
      account: opts.account,
      apiKey: opts.apiKey,
    });
    const connection = await markPull(opts.userId, opts.connectorId, {
      ok: true,
      error: null,
      invoices: parsed.invoices.length,
      gates: parsed.gates.length,
      warnings: parsed.warnings,
    });
    return {
      ok: true,
      error: null,
      mode: "live",
      connection,
      invoices: parsed.invoices,
      gates: parsed.gates,
      warnings: parsed.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live pull failed.";
    const connection = await markPull(opts.userId, opts.connectorId, {
      ok: false,
      error: message,
      invoices: 0,
      gates: 0,
      warnings: [],
    });
    return {
      ok: false,
      error: message,
      mode: "live",
      connection,
      invoices: [],
      gates: [],
      warnings: [],
    };
  }
}

export const saveAndPullConnector = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(validateSave)
  .handler(async ({ context, data }): Promise<PullPayload> => {
    const def = connectorById(data.connectorId);
    if (!def) throw new Error("Unknown connector.");
    const live = def.kind === "open" ? false : isLiveAttempt(def, data.endpoint, data.apiKey);
    const mode: "sandbox" | "live" = live ? "live" : "sandbox";
    if (live && !data.apiKey) throw new Error("API key is required for a live connector.");

    const connection = await upsertConnection({
      userId: context.userId,
      connectorId: def.id,
      account: data.account || def.sandboxAccount,
      endpoint: data.endpoint || def.endpoint,
      mode,
      apiKey: live ? data.apiKey : null,
    });

    if (!live || def.kind === "open") {
      return {
        ok: true,
        error: null,
        mode: "sandbox",
        connection: { ...connection, mode: "sandbox", hasKey: false },
        invoices: [],
        gates: [],
        warnings: [],
      };
    }

    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const secret = await sql<{ api_key: string | null }>`
      select api_key from connections
      where user_id = ${context.userId} and connector_id = ${def.id}
    `;
    const apiKey = secret[0]?.api_key;
    if (!apiKey) {
      return {
        ok: false,
        error: "No key stored. Reconnect with your vendor key.",
        mode: "live",
        connection,
        invoices: [],
        gates: [],
        warnings: [],
      };
    }
    return runLivePull({
      userId: context.userId,
      connectorId: def.id,
      endpoint: connection.endpoint,
      account: connection.account,
      apiKey,
    });
  });

export const pullConnector = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((connectorId: string) => connectorId.trim())
  .handler(async ({ context, data: connectorId }): Promise<PullPayload> => {
    const def = connectorById(connectorId);
    if (!def) throw new Error("Unknown connector.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<ConnectionRow & { api_key: string | null }>`
      select connector_id, account, endpoint, mode, status, last_sync_at, last_error,
             invoices_pulled, gates_pulled, connected_at, api_key,
             (api_key is not null and api_key <> '') as has_key
      from connections
      where user_id = ${context.userId} and connector_id = ${connectorId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Connector is not connected on this account.");
    const connection = toPublic(row);
    if (connection.mode !== "live" || !row.api_key) {
      return {
        ok: true,
        error: null,
        mode: "sandbox",
        connection,
        invoices: [],
        gates: [],
        warnings: [],
      };
    }
    return runLivePull({
      userId: context.userId,
      connectorId,
      endpoint: row.endpoint,
      account: row.account,
      apiKey: row.api_key,
    });
  });
