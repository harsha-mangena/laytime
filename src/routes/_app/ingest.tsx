import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { OsraChecklist } from "@/components/osra-checklist";
import { StatusStamp } from "@/components/status-stamp";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FEEDS, detectFormat, formatLabel, parseNative } from "@/lib/connectors";
import { SAMPLE_MISSING_CERT, SAMPLE_TMS_LAG } from "@/lib/ingest";
import { money } from "@/lib/format";
import { scanInvoice } from "@/lib/osra";
import { useLaytime } from "@/lib/store";

export const Route = createFileRoute("/_app/ingest")({
  component: IngestPage,
});

const SAMPLES: { id: string; label: string; body: string }[] = [
  { id: "laytime", label: "Laytime JSON", body: SAMPLE_MISSING_CERT },
  { id: "lag", label: "TMS lag envelope", body: SAMPLE_TMS_LAG },
  { id: "cargowise", label: "CargoWise", body: FEEDS.cargowise.body },
  { id: "tango", label: "Tango", body: FEEDS.tango.body },
  { id: "msc", label: "MSC JSON", body: FEEDS.msc.body },
  { id: "maersk", label: "Maersk JSON", body: FEEDS.maersk.body },
  { id: "cma", label: "X12 310", body: FEEDS.cma.body },
  { id: "maher", label: "CODECO", body: FEEDS.maher.body },
  { id: "apm", label: "APM TOS", body: FEEDS.apm.body },
];

function IngestPage() {
  const [text, setText] = useState(SAMPLE_MISSING_CERT);
  const [error, setError] = useState<string | null>(null);
  const addBatch = useLaytime((s) => s.addBatch);
  const navigate = useNavigate();

  const preview = useMemo(() => {
    try {
      const parsed = parseNative(text);
      const scan = parsed.invoices[0] ? scanInvoice(parsed.invoices[0], parsed.gates) : null;
      return { parsed, scan, error: null as string | null };
    } catch (e) {
      return {
        parsed: null,
        scan: null,
        error: e instanceof Error ? e.message : "Unrecognized payload",
      };
    }
  }, [text]);

  function commit() {
    if (!preview.parsed || (!preview.parsed.invoices.length && !preview.parsed.gates.length)) {
      setError(preview.error ?? "Nothing to ingest.");
      return;
    }
    const added = addBatch(preview.parsed.invoices, preview.parsed.gates);
    toast(`Ingested ${added.addedInvoices} invoices, ${added.addedGates} gate events.`);
    const first = preview.parsed.invoices[0];
    if (first) {
      navigate({ to: "/invoices/$invoiceId", params: { invoiceId: first.id } });
    } else {
      navigate({ to: "/gates" });
    }
  }

  let detected = "";
  try {
    detected = formatLabel(detectFormat(text));
  } catch {
    detected = "";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Feed</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Ingest</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Drop a native document — CargoWise UniversalShipment, Tango loads, X12 310, CODECO, TOS
          JSON, or the Laytime envelope. The same adapters the connectors use.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <Button key={s.id} variant="secondary" size="sm" onClick={() => setText(s.body)}>
            {s.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            spellCheck={false}
            className="min-h-[28rem]"
            aria-label="Native invoice or gate document"
          />
          {error || preview.error ? (
            <p className="mt-2 text-sm text-destructive">{error ?? preview.error}</p>
          ) : detected ? (
            <p className="mt-2 text-xs text-muted-foreground">Detected {detected}</p>
          ) : null}
          <Button
            className="mt-4"
            onClick={commit}
            disabled={!preview.parsed || (!preview.parsed.invoices.length && !preview.parsed.gates.length)}
          >
            Add to desk
          </Button>
        </div>
        <div>
          {preview.scan && preview.parsed?.invoices[0] ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusStamp scan={preview.scan} status={preview.parsed.invoices[0].status} />
                <span className="font-mono text-sm">{money(preview.parsed.invoices[0].amountDue)}</span>
                <span className="stamp text-muted-foreground">Score {preview.scan.score}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {preview.parsed.invoices.length} invoice
                {preview.parsed.invoices.length === 1 ? "" : "s"} · {preview.parsed.gates.length} gate
                events
                {preview.scan.obligationToPay
                  ? " — formally payable unless you still contest the facts."
                  : " — no obligation to pay under 46 CFR 541.5."}
              </p>
              <OsraChecklist checks={preview.scan.checks} />
            </div>
          ) : preview.parsed?.gates.length ? (
            <p className="text-sm text-muted-foreground">
              {preview.parsed.gates.length} gate events ready to land on the tape. No invoice in this
              document.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Fix the payload to see the scan.</p>
          )}
        </div>
      </div>
    </div>
  );
}
