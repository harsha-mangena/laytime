import { createFileRoute } from "@tanstack/react-router";
import { OSRA_FIELDS } from "@/lib/osra";

export const Route = createFileRoute("/_app/rules")({
  component: RulesPage,
});

function RulesPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          Ocean Shipping Reform Act of 2022
        </p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Rulebook</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          FMC demurrage and detention billing rules in 46 CFR Part 541, effective May 2024. If an
          invoice is missing any required element — or is inaccurate — the billed party is not
          obligated to pay.
        </p>
      </header>

      <section className="rounded-xl bg-card p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.08)] md:p-8">
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">The hammer</p>
        <p className="mt-3 max-w-2xl text-lg leading-snug">
          Failure to include the minimum information in an invoice eliminates the billed party’s
          obligation to pay the applicable charges. 46 CFR 541.5.
        </p>
      </section>

      <ol className="flex flex-col gap-4">
        {OSRA_FIELDS.map((field) => (
          <li
            key={field.code}
            className="grid gap-2 rounded-xl border border-border px-5 py-5 md:grid-cols-[9rem_1fr]"
          >
            <p className="font-mono text-xs text-muted-foreground">{field.code}</p>
            <div>
              <h2 className="text-base font-medium">{field.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{field.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <h2 className="mb-2 text-foreground">Why mid-market desks lose the window</h2>
        <p>
          CargoWise and Tango often trail terminal gate events by two to four hours — sometimes a
          full shift. Carriers still print an availability date from their own stack. Laytime
          compares the invoice to the terminal tape, not the TMS, and starts the 30-day dispute
          clock the moment the invoice lands.
        </p>
      </section>
    </div>
  );
}
