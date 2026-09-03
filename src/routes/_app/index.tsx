import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ClockStamp, StatusStamp } from "@/components/status-stamp";
import { Button } from "@/components/ui/button";
import { asOfLabel, containerPretty, money } from "@/lib/format";
import { CONNECTORS, connectorById } from "@/lib/connectors";
import { DESK } from "@/lib/seed";
import { kpis, withScans } from "@/lib/selectors";
import { useLaytime } from "@/lib/store";

export const Route = createFileRoute("/_app/")({
  component: Command,
});

function Command() {
  const invoices = useLaytime((s) => s.invoices);
  const gates = useLaytime((s) => s.gates);
  const createDispute = useLaytime((s) => s.createDispute);
  const reset = useLaytime((s) => s.reset);
  const navigate = useNavigate();
  const rows = withScans(invoices, gates);
  const stats = kpis(rows);
  const maxCarrier = Math.max(...stats.carrier.map((c) => c.amount), 1);

  function generateCritical() {
    const created = stats.criticalRows.filter((r) => r.invoice.status === "open");
    if (created.length === 0) {
      toast("No open critical invoices left to pack.");
      return;
    }
    created.forEach((r) => createDispute(r.invoice.id));
    toast(`Opened ${created.length} dispute pack${created.length === 1 ? "" : "s"}.`);
    navigate({ to: "/disputes" });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          {DESK.desk} · {asOfLabel()}
        </p>
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">Command</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          OSRA 2022 scan of carrier and MTO invoices against terminal gate tape. Missing required
          fields eliminate the obligation to pay.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-card p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.08)] md:p-8">
          <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            Recoverable this desk
          </p>
          <p className="mt-3 font-mono text-4xl tracking-tight text-foreground tabular-nums md:text-5xl">
            {money(stats.recoverable)}
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            {stats.voidable} invoices fail 46 CFR 541.6 or 541.7. {stats.flagged} total flagged
            including incentive-principle disputes.
          </p>
        </div>
        <div className="flex flex-col justify-between rounded-xl bg-card p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.08)] md:p-8">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              30-day dispute clock
            </p>
            <p className="mt-3 font-mono text-4xl tabular-nums">{stats.critical}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Open invoices at or past five days remaining.
            </p>
          </div>
          <Button className="mt-6 w-full sm:w-auto" onClick={generateCritical}>
            Pack critical disputes
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "Flagged", v: stats.flagged },
          { k: "Clean", v: stats.clean },
          { k: "Recovered", v: money(stats.recovered) },
          { k: "On desk", v: stats.total },
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

      <HarborBanner />
      <PortOpsBanner />
      <SourcesStrip />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium tracking-wide">Critical clocks</h2>
            <Link to="/invoices" className="text-xs text-muted-foreground hover:text-foreground">
              All invoices
            </Link>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {stats.criticalRows.slice(0, 6).map(({ invoice, scan }) => (
              <li key={invoice.id}>
                <Link
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: invoice.id }}
                  className="flex flex-col gap-2 px-4 py-4 transition-colors duration-150 hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{containerPretty(invoice.containerNumber)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {invoice.billingParty} · {money(invoice.amountDue)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusStamp scan={scan} status={invoice.status} />
                    <ClockStamp clock={scan.clock} days={scan.daysRemaining} />
                  </div>
                </Link>
              </li>
            ))}
            {stats.criticalRows.length === 0 ? (
              <li className="px-4 py-8 text-sm text-muted-foreground">No critical clocks on the desk.</li>
            ) : null}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium tracking-wide">Exposure by billing party</h2>
          <ul className="flex flex-col gap-3">
            {stats.carrier.slice(0, 7).map((c) => (
              <li key={c.name}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="font-mono text-xs tabular-nums">{money(c.amount)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-steel/80"
                    style={{ width: `${Math.max(6, (c.amount / maxCarrier) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <button
        type="button"
        onClick={() => {
          reset();
          toast("Desk restored to the sample book.");
        }}
        className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Restore sample book
      </button>
    </div>
  );
}

function HarborBanner() {
  const harbor = useLaytime((s) => s.harbor);
  if (!harbor) return null;
  const cells = [
    {
      k: "Tide Battery",
      v: harbor.tideFt != null ? `${harbor.tideFt.toFixed(2)} ft` : "—",
    },
    {
      k: "Next tide",
      v: harbor.nextTide
        ? `${harbor.nextTide.type === "H" ? "High" : "Low"} ${harbor.nextTide.feet.toFixed(1)}`
        : "—",
    },
    {
      k: "Wind Sandy Hook",
      v: harbor.windMph != null ? `${harbor.windMph} mph ${harbor.windDir ?? ""}` : "—",
    },
    {
      k: "Air",
      v: harbor.tempF != null ? `${harbor.tempF.toFixed(0)}°F` : "—",
    },
    harbor.currentKt != null
      ? {
          k: "Newark current",
          v: `${harbor.currentKt.toFixed(2)} kt${harbor.currentDirDeg != null ? ` ${harbor.currentDirDeg}°` : ""}`,
        }
      : null,
    harbor.airGapFt != null
      ? { k: "Bayonne air gap", v: `${harbor.airGapFt.toFixed(1)} ft` }
      : null,
    harbor.waveFt != null
      ? {
          k: "Entrance seas",
          v: `${harbor.waveFt.toFixed(1)} ft${harbor.wavePeriodSec != null ? ` / ${harbor.wavePeriodSec}s` : ""}`,
        }
      : null,
    harbor.waterTempF != null ? { k: "Water", v: `${harbor.waterTempF.toFixed(0)}°F` } : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <section className="rounded-xl bg-card px-5 py-4 shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide">NY Harbor · live NOAA</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {harbor.tideTime ?? harbor.fetchedAt.slice(0, 16).replace("T", " ")} UTC
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cells.map((item) => (
          <div key={item.k}>
            <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{item.k}</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums">{item.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PortOpsBanner() {
  const forecast = useLaytime((s) => s.forecast);
  const alerts = useLaytime((s) => s.alerts) ?? [];
  const vesselCalls = useLaytime((s) => s.vesselCalls) ?? [];
  const gateHours = useLaytime((s) => s.gateHours);
  if (!forecast && !alerts.length && !vesselCalls.length && !gateHours) return null;
  const onBerth = vesselCalls.filter((v) => v.status === "arrived").length;
  const due = vesselCalls.filter((v) => v.status === "due").length;
  const notice = gateHours?.notices[0] ?? null;

  return (
    <section className="rounded-xl border border-border px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide">Port operations · live public</h2>
        <Link to="/gates" className="text-xs text-muted-foreground hover:text-foreground">
          Vessel board and gate hours
        </Link>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {forecast ? (
          <div>
            <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">NWS Harbor</p>
            <p className="mt-1 text-sm leading-relaxed">{forecast.headline}</p>
          </div>
        ) : null}
        {vesselCalls.length ? (
          <div>
            <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">PNCT board</p>
            <p className="mt-1 font-mono text-sm tabular-nums">
              {onBerth} on berth · {due} due · {vesselCalls.length} calls
            </p>
            {notice ? <p className="mt-1 text-sm text-warn">{notice}</p> : null}
          </div>
        ) : null}
        {alerts.length ? (
          <div>
            <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Alerts</p>
            <ul className="mt-1 space-y-1 text-sm">
              {alerts.slice(0, 3).map((a) => (
                <li key={a.id}>
                  {a.event}
                  <span className="text-muted-foreground"> · {a.severity}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SourcesStrip() {
  const connections = useLaytime((s) => s.connections);
  const live = connections.filter((c) => c.status === "connected" || c.status === "syncing");
  return (
    <section className="rounded-xl border border-border px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide">Sources</h2>
        <Link to="/connectors" className="text-xs text-muted-foreground hover:text-foreground">
          {live.length ? "Manage connectors" : "Connect TMS, carrier, terminal"}
        </Link>
      </div>
      {live.length === 0 ? (
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Sample book only. Pull NY Harbor live for NOAA, NWS, and the PNCT vessel board —{" "}
          {CONNECTORS.length} adapters on the catalog.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {live.map((c) => (
            <li
              key={c.connectorId}
              className="rounded-md bg-secondary px-3 py-1.5 font-mono text-xs text-foreground"
            >
              {connectorById(c.connectorId)?.name ?? c.connectorId}
              <span className="text-muted-foreground">
                {" "}
                · {c.invoicesPulled} inv / {c.gatesPulled} gates
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
