import { createFileRoute, Link } from "@tanstack/react-router";
import { GateTimeline } from "@/components/gate-timeline";
import { containerPretty, shortDateTime } from "@/lib/format";
import { useLaytime } from "@/lib/store";

export const Route = createFileRoute("/_app/gates")({
  component: GatesPage,
});

function GatesPage() {
  const gates = useLaytime((s) => s.gates);
  const invoices = useLaytime((s) => s.invoices);
  const harbor = useLaytime((s) => s.harbor);
  const openTerminals = useLaytime((s) => s.openTerminals) ?? [];
  const portCalls = useLaytime((s) => s.portCalls) ?? [];
  const vesselCalls = useLaytime((s) => s.vesselCalls) ?? [];
  const forecast = useLaytime((s) => s.forecast);
  const alerts = useLaytime((s) => s.alerts) ?? [];
  const gateHours = useLaytime((s) => s.gateHours);
  const byBox = new Map<string, typeof gates>();
  for (const g of gates) {
    const list = byBox.get(g.containerNumber) ?? [];
    list.push(g);
    byBox.set(g.containerNumber, list);
  }
  const groups = Array.from(byBox.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const hasLive =
    harbor ||
    openTerminals.length ||
    portCalls.length ||
    vesselCalls.length ||
    forecast ||
    alerts.length ||
    gateHours;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Terminal</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Gate tape</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          In-gate, availability, holds, and TMS sync events used to test whether an invoice is
          accurate under 46 CFR 541.6. Live NOAA, NWS, and the PNCT public board sit above the
          Northbridge book.
        </p>
      </header>

      {hasLive ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {harbor ? (
            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-medium tracking-wide">NY Harbor conditions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                NOAA CO-OPS · {harbor.tideStation}
              </p>
              <ul className="mt-3 space-y-1 font-mono text-sm">
                <li>Tide {harbor.tideFt != null ? `${harbor.tideFt.toFixed(2)} ft` : "—"} MLLW</li>
                <li>
                  Wind {harbor.windMph != null ? `${harbor.windMph} mph ${harbor.windDir ?? ""}` : "—"}
                  {harbor.gustMph != null ? ` gust ${harbor.gustMph}` : ""}
                </li>
                <li>Air {harbor.tempF != null ? `${harbor.tempF.toFixed(0)}°F` : "—"}</li>
                {harbor.currentKt != null ? (
                  <li>
                    Current {harbor.currentKt.toFixed(2)} kt
                    {harbor.currentDirDeg != null ? ` ${harbor.currentDirDeg}°` : ""} Newark Bay
                  </li>
                ) : null}
                {harbor.airGapFt != null ? (
                  <li>Air gap {harbor.airGapFt.toFixed(1)} ft Bayonne Bridge</li>
                ) : null}
                {harbor.waveFt != null ? (
                  <li>
                    Seas {harbor.waveFt.toFixed(1)} ft
                    {harbor.wavePeriodSec != null ? ` / ${harbor.wavePeriodSec} s` : ""} entrance
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
          {forecast || alerts.length ? (
            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-medium tracking-wide">NWS NY Harbor</h2>
              <p className="mt-1 text-xs text-muted-foreground">{forecast?.zone ?? "api.weather.gov"}</p>
              {forecast ? (
                <p className="mt-3 text-sm leading-relaxed">{forecast.headline}</p>
              ) : null}
              {forecast?.marine ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{forecast.marine}</p>
              ) : null}
              {alerts.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {alerts.map((a) => (
                    <li key={a.id}>
                      {a.event}
                      <span className="text-muted-foreground"> · {a.severity}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          {gateHours ? (
            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-medium tracking-wide">PNCT gate hours</h2>
              {gateHours.notices.map((n) => (
                <p key={n} className="mt-2 text-sm text-warn">
                  {n}
                </p>
              ))}
              {gateHours.lastTruck ? (
                <p className="mt-2 text-sm text-muted-foreground">Last truck {gateHours.lastTruck}</p>
              ) : null}
              <ul className="mt-3 space-y-1 text-sm">
                {gateHours.windows.map((w) => (
                  <li key={w.label} className="flex flex-wrap justify-between gap-2">
                    <span>{w.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{w.hours}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {openTerminals.length ? (
            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-medium tracking-wide">OSM terminals</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {openTerminals.map((t) => (
                  <li key={t.id}>
                    <p>{t.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {t.lat.toFixed(4)}, {t.lon.toFixed(4)}
                      {t.address ? ` · ${t.address}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {vesselCalls.length ? (
            <section className="rounded-xl border border-border p-5 lg:col-span-2">
              <h2 className="text-sm font-medium tracking-wide">PNCT vessel board</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Public schedule from Port Newark Container Terminal. Live calls, not invoices.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {vesselCalls.slice(0, 16).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <span>
                      {p.vessel}
                      {p.voyage ? (
                        <span className="font-mono text-xs text-muted-foreground"> · {p.voyage}</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.status ?? "due"}
                      {p.ata
                        ? ` · ata ${shortDateTime(p.ata)}`
                        : p.eta
                          ? ` · eta ${shortDateTime(p.eta)}`
                          : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {portCalls.length ? (
            <section className="rounded-xl border border-border p-5 lg:col-span-2">
              <h2 className="text-sm font-medium tracking-wide">Fintraffic cargo port calls</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Live Portnet feed. Baltic ports — not NY/NJ invoices.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {portCalls.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <span>{p.vessel}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.port}
                      {p.prevPort ? ` ← ${p.prevPort}` : ""}
                      {p.eta ? ` · ${shortDateTime(p.eta)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {groups.map(([container, events]) => {
          const inv = invoices.find(
            (i) => i.containerNumber.replace(/\s+/g, "") === container.replace(/\s+/g, ""),
          );
          return (
            <section key={container} className="rounded-xl border border-border p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-mono text-sm">{containerPretty(container)}</h2>
                {inv ? (
                  <Link
                    to="/invoices/$invoiceId"
                    params={{ invoiceId: inv.id }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {inv.invoiceNumber}
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">No invoice matched</span>
                )}
              </div>
              <GateTimeline events={events} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
