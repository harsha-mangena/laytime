import type { ScanResult } from "./types";

export function scanResponse(scan: ScanResult) {
  return {
    obligation_to_pay: scan.obligationToPay,
    voidable: scan.voidable,
    score: scan.score,
    recoverable_amount: scan.recoverableAmount,
    dispute_deadline: scan.disputeDeadline,
    days_remaining: scan.daysRemaining,
    clock: scan.clock,
    tms_lag_hours: scan.tmsLagHours,
    recommended_action: scan.recommendedAction,
    violations: [...scan.failedVoid, ...scan.failedDispute].map((c) => ({
      code: c.code,
      label: c.label,
      category: c.category,
      severity: c.severity,
      detail: c.detail,
    })),
    checks: scan.checks.map((c) => ({
      code: c.code,
      label: c.label,
      category: c.category,
      passed: c.passed,
      severity: c.severity,
      detail: c.detail,
    })),
  };
}
