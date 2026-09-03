import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FEEDS } from "@/lib/connectors";
import { SAMPLE_MISSING_CERT, SAMPLE_TMS_LAG } from "@/lib/ingest";

export const Route = createFileRoute("/_app/api-docs")({
  component: ApiDocsPage,
});

const ENDPOINTS = [
  {
    id: "scan",
    method: "POST" as const,
    path: "/api/v1/scan",
    contentType: "application/json",
    blurb: "Scan a Laytime-shaped invoice (and optional gate events) against 46 CFR 541. Returns obligation, violations, and a draft dispute letter.",
    sample: SAMPLE_TMS_LAG,
  },
  {
    id: "ingest",
    method: "POST" as const,
    path: "/api/v1/ingest",
    contentType: "application/json",
    blurb: "Auto-detect CargoWise, Tango, MSC, Maersk, TOS JSON, X12 310, or CODECO and run the same OSRA engine.",
    sample: FEEDS.cargowise.body,
  },
  {
    id: "connectors",
    method: "GET" as const,
    path: "/api/v1/connectors",
    contentType: "application/json",
    blurb: "Catalog of TMS, carrier, and terminal adapters — protocol, native format, and sandbox endpoint.",
    sample: "",
  },
  {
    id: "rules",
    method: "GET" as const,
    path: "/api/v1/rules",
    contentType: "application/json",
    blurb: "Required OSRA 2022 invoice contents and the 30-day clocks.",
    sample: "",
  },
];

function ApiDocsPage() {
  const [id, setId] = useState<(typeof ENDPOINTS)[number]["id"]>("ingest");
  const ep = ENDPOINTS.find((item) => item.id === id)!;
  const [body, setBody] = useState(FEEDS.cargowise.body);
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const edi = body.trim().startsWith("ISA") || body.trim().startsWith("UNB");
      const res = await fetch(ep.path, {
        method: ep.method,
        headers:
          ep.method === "POST"
            ? { "content-type": edi ? "text/plain" : "application/json" }
            : undefined,
        body: ep.method === "POST" ? body : undefined,
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
      if (!res.ok) toast("Call returned an error.");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Middleware</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">API</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Point CargoWise eAdaptor, a Tango export, a 310 mailbox, or a TOS feed at ingest. Scan
          remains the Laytime-shaped contract. Vendor keys are stored on a signed-in account via
          Connectors — they are not accepted on these public scan routes.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {ENDPOINTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setId(item.id);
              setBody(item.sample || body);
              setResult("");
            }}
            className={`h-11 rounded-md px-3 font-mono text-xs ${
              id === item.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            {item.method} {item.path}
          </button>
        ))}
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{ep.blurb}</p>

      {ep.method === "POST" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setBody(SAMPLE_MISSING_CERT)}>
            Laytime JSON
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setBody(SAMPLE_TMS_LAG)}>
            TMS lag envelope
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setBody(FEEDS.cargowise.body)}>
            CargoWise
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setBody(FEEDS.cma.body)}>
            X12 310
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setBody(FEEDS.maher.body)}>
            CODECO
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {ep.method === "POST" ? (
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            className="min-h-[24rem]"
            aria-label="Request body"
          />
        ) : (
          <div className="rounded-lg border border-border p-4 font-mono text-xs text-muted-foreground">
            No request body.
          </div>
        )}
        <pre className="min-h-[24rem] overflow-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed">
          {result || "Response will land here."}
        </pre>
      </div>

      <Button onClick={run} disabled={busy}>
        {busy ? "Calling…" : "Run against live API"}
      </Button>
    </div>
  );
}
