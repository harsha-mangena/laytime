import { categoryLabel } from "@/lib/osra";
import type { CheckCategory, OsraCheck } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDER: CheckCategory[] = [
  "identifying",
  "timing",
  "rate",
  "dispute_info",
  "certification",
  "issuance",
  "accuracy",
  "incentive",
];

export function OsraChecklist({ checks }: { checks: OsraCheck[] }) {
  const groups = ORDER.map((cat) => ({
    cat,
    items: checks.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.cat}>
          <h3 className="mb-2 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {categoryLabel(group.cat)}
          </h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {group.items.map((item) => (
              <li key={item.code} className="flex gap-3 px-3 py-3">
                <span
                  className={cn(
                    "mt-0.5 size-2 shrink-0 rounded-full",
                    item.passed ? "bg-ok" : item.severity === "void" ? "bg-destructive" : "bg-warn",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm text-foreground">{item.label}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{item.code}</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
