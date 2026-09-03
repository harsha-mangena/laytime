import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plug, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  CONNECTORS,
  KIND_LABEL,
  NORTHBRIDGE_STACK,
  OPEN_STACK,
  connectorById,
  feedFor,
  isLiveAttempt,
  type ConnectorDef,
  type ConnectorKind,
} from "@/lib/connectors";
import {
  disconnectConnector,
  listConnections,
  pullConnector,
  saveAndPullConnector,
  type PullPayload,
} from "@/lib/connectors/desk-fns";
import { AS_OF_ISO } from "@/lib/as-of";
import { shortDateTime } from "@/lib/format";
import { useLaytime } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/connectors")({
  component: ConnectorsPage,
});

const KINDS: ConnectorKind[] = ["open", "tms", "carrier", "terminal"];

function stampNow() {
  return `${AS_OF_ISO}T12:00:00`;
}

function isUnauthorized(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error ?? "");
  return message === "Unauthorized" || /unauthorized/i.test(message);
}

function ConnectorsPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const connections = useLaytime((s) => s.connections);
  const syncJobs = useLaytime((s) => s.syncJobs);
  const connectSource = useLaytime((s) => s.connectSource);
  const disconnectSource = useLaytime((s) => s.disconnectSource);
  const setSourceStatus = useLaytime((s) => s.setSourceStatus);
  const addBatch = useLaytime((s) => s.addBatch);
  const recordSync = useLaytime((s) => s.recordSync);
  const applyOpenPull = useLaytime((s) => s.applyOpenPull);
  const upsertConnection = useLaytime((s) => s.upsertConnection);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const byId = new Map(connections.map((c) => [c.connectorId, c]));
  const connectedCount = connections.filter((c) => c.status !== "disconnected").length;
  const draft = draftId ? connectorById(draftId) : null;

  function needSignIn() {
    toast("Sign in to store a vendor key on your account.");
    void navigate({ to: "/login", search: { redirect: "/connectors" } });
  }

  async function refreshServerConnections() {
    if (!user) return;
    try {
      const rows = await listConnections();
      useLaytime.getState().setConnections(rows);
    } catch (error) {
      if (isUnauthorized(error)) return;
    }
  }

  function applySandboxFeed(id: string) {
    const result = feedFor(id);
    const added = addBatch(result.invoices, result.gates);
    recordSync({
      connectorId: id,
      at: stampNow(),
      format: result.format,
      invoices: result.invoices.length,
      gates: result.gates.length,
      addedInvoices: added.addedInvoices,
      addedGates: added.addedGates,
      warnings: result.warnings,
    });
    const name = connectorById(id)?.name ?? id;
    if (added.addedInvoices || added.addedGates) {
      toast(`${name}: +${added.addedInvoices} invoices, +${added.addedGates} gate events.`);
    } else if (result.invoices.length || result.gates.length) {
      toast(`${name}: already on the desk (${result.invoices.length} inv / ${result.gates.length} gates scanned).`);
    } else {
      toast(`${name}: sandbox feed was empty.`);
    }
  }

  function applyLivePayload(id: string, payload: PullPayload) {
    upsertConnection(payload.connection);
    if (!payload.ok) {
      setSourceStatus(id, "error", payload.error);
      toast(payload.error ?? "Live pull failed.");
      return;
    }
    const added = addBatch(payload.invoices, payload.gates);
    const def = connectorById(id);
    recordSync({
      connectorId: id,
      at: new Date().toISOString().slice(0, 19),
      format: def?.format ?? "laytime",
      invoices: payload.invoices.length,
      gates: payload.gates.length,
      addedInvoices: added.addedInvoices,
      addedGates: added.addedGates,
      warnings: payload.warnings,
    });
    const name = def?.name ?? id;
    if (added.addedInvoices || added.addedGates) {
      toast(`${name}: +${added.addedInvoices} invoices, +${added.addedGates} gate events.`);
    } else if (payload.invoices.length || payload.gates.length) {
      toast(`${name}: already on the desk (${payload.invoices.length} inv / ${payload.gates.length} gates scanned).`);
    } else {
      toast(`${name}: vendor returned no new invoices or gates.`);
    }
  }

  async function pullOpen(id: string) {
    const def = connectorById(id);
    const res = await fetch(`/api/v1/sources/${id}`);
    const json = (await res.json()) as {
      ok: boolean;
      error?: string;
      warnings?: string[];
      counts?: {
        terminals: number;
        port_calls: number;
        harbor: number;
        vessels: number;
        alerts: number;
        forecast: number;
        hours: number;
      };
    };
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Live pull failed");
    applyOpenPull(json as never);
    const n =
      (json.counts?.port_calls ?? 0) +
      (json.counts?.terminals ?? 0) +
      (json.counts?.harbor ?? 0) +
      (json.counts?.vessels ?? 0) +
      (json.counts?.alerts ?? 0) +
      (json.counts?.forecast ?? 0) +
      (json.counts?.hours ?? 0);
    recordSync({
      connectorId: id,
      at: new Date().toISOString().slice(0, 19),
      format: def?.format ?? "noaa",
      invoices: 0,
      gates: n,
      addedInvoices: 0,
      addedGates: n,
      warnings: json.warnings ?? [],
    });
    const bits = [
      json.counts?.harbor ? "harbor obs" : "",
      json.counts?.forecast ? "forecast" : "",
      json.counts?.alerts ? `${json.counts.alerts} alerts` : "",
      json.counts?.vessels ? `${json.counts.vessels} vessels` : "",
      json.counts?.hours ? "gate hours" : "",
      json.counts?.terminals ? `${json.counts.terminals} terminals` : "",
      json.counts?.port_calls ? `${json.counts.port_calls} port calls` : "",
    ].filter(Boolean);
    toast(`${def?.name ?? id}: ${bits.join(" · ") || "live feed ok"}`);
  }

  async function pull(id: string) {
    const def = connectorById(id);
    const conn = byId.get(id);
    setBusyId(id);
    setSourceStatus(id, "syncing");
    try {
      if (def?.kind === "open") {
        await pullOpen(id);
        return;
      }
      if (conn?.hasKey || conn?.mode === "live") {
        if (!user) {
          needSignIn();
          setSourceStatus(id, "connected");
          return;
        }
        const payload = await pullConnector({ data: id });
        if (payload.mode === "sandbox") applySandboxFeed(id);
        else applyLivePayload(id, payload);
        return;
      }
      await new Promise((r) => setTimeout(r, 280));
      applySandboxFeed(id);
    } catch (e) {
      if (isUnauthorized(e)) {
        needSignIn();
        setSourceStatus(id, "connected");
        return;
      }
      const message = e instanceof Error ? e.message : "Sync failed";
      setSourceStatus(id, "error", message);
      toast(message);
    } finally {
      setBusyId(null);
    }
  }

  async function connect(def: ConnectorDef, account: string, endpoint: string, apiKey: string) {
    const live = isLiveAttempt(def, endpoint, apiKey);
    if (live) {
      if (isPending) return;
      if (!user) {
        needSignIn();
        return;
      }
      setBusyId(def.id);
      setDraftId(null);
      try {
        const payload = await saveAndPullConnector({
          data: { connectorId: def.id, account, endpoint, apiKey },
        });
        applyLivePayload(def.id, payload);
      } catch (e) {
        if (isUnauthorized(e)) needSignIn();
        else toast(e instanceof Error ? e.message : "Could not save the key.");
      } finally {
        setBusyId(null);
      }
      return;
    }

    connectSource({
      connectorId: def.id,
      status: "connected",
      account,
      endpoint,
      connectedAt: stampNow(),
      mode: "sandbox",
      hasKey: false,
    });
    setDraftId(null);
    if (user) {
      try {
        const payload = await saveAndPullConnector({
          data: { connectorId: def.id, account, endpoint, apiKey: "" },
        });
        upsertConnection({ ...payload.connection, mode: "sandbox", hasKey: false });
      } catch (e) {
        if (!isUnauthorized(e)) {
          /* local sandbox still works */
        }
      }
    }
    void pull(def.id);
  }

  async function connectStack() {
    for (const id of NORTHBRIDGE_STACK) {
      const def = connectorById(id);
      if (!def) continue;
      if (!byId.get(id)) {
        connectSource({
          connectorId: def.id,
          status: "connected",
          account: def.sandboxAccount,
          endpoint: def.endpoint,
          connectedAt: stampNow(),
          mode: "sandbox",
          hasKey: false,
        });
        if (user) {
          try {
            await saveAndPullConnector({
              data: {
                connectorId: def.id,
                account: def.sandboxAccount,
                endpoint: def.endpoint,
                apiKey: "",
              },
            });
          } catch {
            /* local sandbox still works */
          }
        }
      }
    }
    if (user) await refreshServerConnections();
    for (const id of NORTHBRIDGE_STACK) {
      await pull(id);
    }
  }

  async function connectOpen() {
    for (const id of OPEN_STACK) {
      const def = connectorById(id);
      if (!def) continue;
      if (!byId.get(id)) {
        connectSource({
          connectorId: def.id,
          status: "connected",
          account: def.sandboxAccount,
          endpoint: def.endpoint,
          connectedAt: stampNow(),
          mode: "live",
          hasKey: false,
        });
      }
    }
    for (const id of OPEN_STACK) {
      await pull(id);
    }
  }

  async function syncAll() {
    const ids = connections.map((c) => c.connectorId);
    if (!ids.length) {
      toast("Connect a source first.");
      return;
    }
    for (const id of ids) await pull(id);
  }

  async function onDisconnect(id: string) {
    disconnectSource(id);
    if (user) {
      try {
        await disconnectConnector({ data: id });
      } catch (e) {
        if (isUnauthorized(e)) return;
      }
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Sources</p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight">Connectors</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Paste a vendor HTTPS URL and key to pull live. Keys live on your account, not in this
            browser. Catalog sandbox tokens still load the Northbridge sample book through the native
            parser. Public harbor feeds need no key.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void connectOpen()} disabled={busyId !== null}>
            Pull NY Harbor live
          </Button>
          <Button onClick={() => void connectStack()} disabled={busyId !== null}>
            <Plug className="size-4" />
            Connect Northbridge stack
          </Button>
          <Button variant="secondary" onClick={() => void syncAll()} disabled={busyId !== null}>
            <RefreshCw className={cn("size-4", busyId && "animate-spin")} />
            Sync all
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "Connected", v: connectedCount },
          { k: "Catalog", v: CONNECTORS.length },
          { k: "Invoices pulled", v: connections.reduce((n, c) => n + c.invoicesPulled, 0) },
          { k: "Gate events", v: connections.reduce((n, c) => n + c.gatesPulled, 0) },
        ].map((item) => (
          <div
            key={item.k}
            className="rounded-lg bg-card px-4 py-4 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
          >
            <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{item.k}</p>
            <p className="mt-2 font-mono text-xl tabular-nums">{item.v}</p>
          </div>
        ))}
      </section>

      {KINDS.map((kind) => (
        <section key={kind} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium tracking-wide">{KIND_LABEL[kind]}</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {CONNECTORS.filter((c) => c.kind === kind).map((def) => {
              const conn = byId.get(def.id);
              const live = conn && conn.status !== "disconnected";
              const syncing = busyId === def.id || conn?.status === "syncing";
              return (
                <li
                  key={def.id}
                  className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium">{def.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {def.vendor} · {def.protocol}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "stamp shrink-0",
                        live ? "text-ok" : "text-muted-foreground",
                      )}
                    >
                      {syncing ? "Syncing" : live ? (conn.hasKey ? "Live key" : "Connected") : "Off"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{def.blurb}</p>
                  {live ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {conn.account}
                      {conn.mode === "live" && conn.hasKey ? " · key on account" : conn.mode === "sandbox" ? " · sandbox" : ""}
                      {conn.lastSyncAt ? ` · last sync ${shortDateTime(conn.lastSyncAt)}` : ""}
                      {` · ${conn.invoicesPulled} inv / ${conn.gatesPulled} gates`}
                    </p>
                  ) : null}
                  {conn?.lastError ? (
                    <p className="text-xs leading-relaxed text-warn">{conn.lastError}</p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-2">
                    {live ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void pull(def.id)}
                          disabled={busyId !== null}
                        >
                          <RefreshCw className="size-3.5" />
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void onDisconnect(def.id)}
                          disabled={busyId !== null}
                        >
                          <Unplug className="size-3.5" />
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() =>
                          def.kind === "open"
                            ? void connect(def, def.sandboxAccount, def.endpoint, "")
                            : setDraftId(def.id)
                        }
                      >
                        {def.kind === "open" ? "Connect public" : "Connect"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium tracking-wide">Sync log</h2>
          <Link to="/ingest" className="text-xs text-muted-foreground hover:text-foreground">
            Drop a native file instead
          </Link>
        </div>
        {syncJobs.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-8 text-sm text-muted-foreground">
            No pulls yet. Connect a live vendor with your key, or the Northbridge stack to ingest a
            CargoWise book, MSC invoices, and APM gate tape through their native adapters.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {syncJobs.map((job) => (
              <li key={job.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm">{connectorById(job.connectorId)?.name ?? job.connectorId}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.format} · {shortDateTime(job.at)}
                    {job.warnings[0] ? ` · ${job.warnings[0]}` : ""}
                  </p>
                </div>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  +{job.addedInvoices} inv · +{job.addedGates} gates
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={Boolean(draft)} onOpenChange={(open) => !open && setDraftId(null)}>
        <SheetContent side="right" className="flex flex-col gap-5 overflow-y-auto">
          {draft ? (
            <ConnectForm
              key={draft.id}
              def={draft}
              busy={busyId === draft.id}
              signedIn={Boolean(user)}
              sessionPending={isPending}
              onCancel={() => setDraftId(null)}
              onConnect={(account, endpoint, apiKey) => void connect(draft, account, endpoint, apiKey)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConnectForm({
  def,
  busy,
  signedIn,
  sessionPending,
  onCancel,
  onConnect,
}: {
  def: ConnectorDef;
  busy: boolean;
  signedIn: boolean;
  sessionPending: boolean;
  onCancel: () => void;
  onConnect: (account: string, endpoint: string, apiKey: string) => void;
}) {
  const [account, setAccount] = useState(def.sandboxAccount);
  const [key, setKey] = useState(def.sandboxKey);
  const [endpoint, setEndpoint] = useState(def.endpoint);
  const live = isLiveAttempt(def, endpoint, key);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{def.name}</SheetTitle>
      </SheetHeader>
      <p className="text-sm leading-relaxed text-muted-foreground">{def.blurb}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {live
          ? signedIn
            ? "This URL and key are stored on your Laytime account. The pull is HTTPS-only; private and loopback addresses are blocked. A failed vendor call never falls back to the sample book."
            : "Sign in to store this key on your account. Keys are never kept in the browser."
          : "Catalog sandbox URL and token load the Northbridge sample book through this vendor's native parser. Paste your own HTTPS endpoint and key to pull live."}
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acct">{def.accountLabel}</Label>
          <Input id="acct" value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="key">API key / mailbox token</Label>
          <Input
            id="key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ep">Endpoint</Label>
          <Input id="ep" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <Button
          onClick={() =>
            onConnect(account.trim() || def.sandboxAccount, endpoint.trim() || def.endpoint, key.trim())
          }
          disabled={busy || sessionPending || (live && !key.trim())}
        >
          {live ? (signedIn ? "Save key and pull" : "Sign in to save key") : "Connect sandbox"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}
