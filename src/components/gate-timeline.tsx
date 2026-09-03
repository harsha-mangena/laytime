import { shortDateTime } from "@/lib/format";
import type { GateEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABELS: Record<GateEvent["eventType"], string> = {
  discharge: "Discharge",
  available: "Available",
  outgate: "Out-gate",
  ingate: "In-gate",
  empty_return: "Empty return",
  hold: "Hold",
};

export function GateTimeline({ events }: { events: GateEvent[] }) {
  const ordered = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (ordered.length === 0) {
    return (
      <p className="rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground">
        No terminal gate records matched this container.
      </p>
    );
  }
  return (
    <ol className="relative ml-3 border-l border-border">
      {ordered.map((event) => (
        <li key={event.id} className="relative mb-5 ml-5 last:mb-0">
          <span
            className={cn(
              "absolute top-1.5 -left-[1.45rem] size-2 rounded-full",
              event.eventType === "hold"
                ? "bg-destructive"
                : event.source === "tms"
                  ? "bg-warn"
                  : "bg-steel",
            )}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              {LABELS[event.eventType]}
              <span className="ml-2 text-xs text-muted-foreground">
                {event.source}
                {event.source === "tms" ? " lag" : ""}
              </span>
            </p>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {shortDateTime(event.timestamp)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{event.terminal}</p>
          {event.notes ? <p className="mt-1 text-xs leading-relaxed text-foreground/80">{event.notes}</p> : null}
        </li>
      ))}
    </ol>
  );
}
