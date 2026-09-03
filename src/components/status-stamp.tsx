import { cn } from "@/lib/utils";
import type { ClockStatus, InvoiceStatus, ScanResult } from "@/lib/types";

export function obligationStamp(scan: ScanResult, status: InvoiceStatus) {
  if (status === "recovered") return { label: "Recovered", tone: "ok" as const };
  if (status === "paid") return { label: "Paid", tone: "steel" as const };
  if (status === "disputed") return { label: "Disputed", tone: "warn" as const };
  if (scan.clock === "expired" && !scan.obligationToPay)
    return { label: "Clock lapsed", tone: "void" as const };
  if (!scan.obligationToPay) return { label: "No obligation", tone: "void" as const };
  if (scan.recommendedAction === "dispute") return { label: "Disputable", tone: "warn" as const };
  return { label: "Clean", tone: "ok" as const };
}

const toneClass = {
  void: "text-destructive",
  ok: "text-ok",
  warn: "text-warn",
  steel: "text-steel",
};

export function StatusStamp({
  scan,
  status,
  className,
}: {
  scan: ScanResult;
  status: InvoiceStatus;
  className?: string;
}) {
  const s = obligationStamp(scan, status);
  return <span className={cn("stamp", toneClass[s.tone], className)}>{s.label}</span>;
}

export function ClockStamp({ clock, days }: { clock: ClockStatus; days: number | null }) {
  if (days === null) return null;
  const label =
    clock === "expired" ? `${Math.abs(days)}d late` : days === 0 ? "Due today" : `${days}d left`;
  const tone =
    clock === "expired" || clock === "critical"
      ? "text-destructive"
      : clock === "warning"
        ? "text-warn"
        : "text-muted-foreground";
  return <span className={cn("stamp", tone)}>{label}</span>;
}
