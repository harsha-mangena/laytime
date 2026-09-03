import { addDays, differenceInCalendarDays, differenceInHours } from "date-fns";
import { AS_OF } from "./as-of";
import { isoDate, parseDay } from "./format";
import type {
  CheckCategory,
  CheckSeverity,
  ClockStatus,
  GateEvent,
  Invoice,
  OsraCheck,
  ScanResult,
} from "./types";

function present(value: string | number | null | undefined) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function check(
  code: string,
  label: string,
  category: CheckCategory,
  passed: boolean,
  severity: CheckSeverity,
  detail: string,
): OsraCheck {
  return { code, label, category, passed, severity, detail };
}

function availabilityGate(invoice: Invoice, gates: GateEvent[]) {
  const matches = gates
    .filter(
      (g) =>
        g.containerNumber.replace(/\s+/g, "") ===
          invoice.containerNumber.replace(/\s+/g, "") &&
        (g.eventType === "available" || g.eventType === "discharge"),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const terminalAvailable = matches.find(
    (g) => g.eventType === "available" && g.source === "terminal",
  );
  const tmsAvailable = matches.find(
    (g) => g.eventType === "available" && g.source === "tms",
  );
  const hold = gates.find(
    (g) =>
      g.containerNumber.replace(/\s+/g, "") ===
        invoice.containerNumber.replace(/\s+/g, "") && g.eventType === "hold",
  );
  return { terminalAvailable, tmsAvailable, hold, matches };
}

export function disputeDeadlineFor(invoice: Invoice) {
  const issued = parseDay(invoice.invoiceDate);
  if (!issued) return null;
  return addDays(issued, 30);
}

export function clockFor(invoice: Invoice, asOf = AS_OF): {
  deadline: string | null;
  daysRemaining: number | null;
  clock: ClockStatus;
} {
  const deadline = disputeDeadlineFor(invoice);
  if (!deadline) {
    return { deadline: null, daysRemaining: null, clock: "ok" };
  }
  const daysRemaining = differenceInCalendarDays(deadline, asOf);
  let clock: ClockStatus = "ok";
  if (daysRemaining < 0) clock = "expired";
  else if (daysRemaining <= 5) clock = "critical";
  else if (daysRemaining <= 10) clock = "warning";
  return { deadline: isoDate(deadline), daysRemaining, clock };
}

export function scanInvoice(
  invoice: Invoice,
  gates: GateEvent[] = [],
  asOf = AS_OF,
): ScanResult {
  const checks: OsraCheck[] = [];
  const isImport = invoice.direction === "import";
  const isExport = invoice.direction === "export";

  checks.push(
    check(
      "541.6(a)(1)",
      "Bill of lading number",
      "identifying",
      present(invoice.bolNumber),
      "void",
      present(invoice.bolNumber)
        ? `BOL ${invoice.bolNumber} present.`
        : "Invoice omits the bill of lading number. 46 CFR 541.6(a)(1).",
    ),
  );
  checks.push(
    check(
      "541.6(a)(2)",
      "Container number",
      "identifying",
      present(invoice.containerNumber),
      "void",
      present(invoice.containerNumber)
        ? `Container ${invoice.containerNumber} identified.`
        : "Invoice omits the container number. 46 CFR 541.6(a)(2).",
    ),
  );
  if (isImport) {
    checks.push(
      check(
        "541.6(a)(3)",
        "Port of discharge",
        "identifying",
        present(invoice.port),
        "void",
        present(invoice.port)
          ? `Port of discharge ${invoice.port}.`
          : "Import invoice omits port of discharge. 46 CFR 541.6(a)(3).",
      ),
    );
  }
  checks.push(
    check(
      "541.6(a)(4)",
      "Basis of liability",
      "identifying",
      present(invoice.liabilityBasis),
      "void",
      present(invoice.liabilityBasis)
        ? invoice.liabilityBasis!
        : "No basis given for why the billed party is the proper party of interest. 46 CFR 541.6(a)(4).",
    ),
  );

  checks.push(
    check(
      "541.6(b)(1)",
      "Invoice date",
      "timing",
      present(invoice.invoiceDate),
      "void",
      present(invoice.invoiceDate)
        ? `Issued ${invoice.invoiceDate}.`
        : "Invoice date missing. 46 CFR 541.6(b)(1).",
    ),
  );
  checks.push(
    check(
      "541.6(b)(2)",
      "Invoice due date",
      "timing",
      present(invoice.dueDate),
      "void",
      present(invoice.dueDate)
        ? `Due ${invoice.dueDate}.`
        : "Due date missing. 46 CFR 541.6(b)(2).",
    ),
  );
  checks.push(
    check(
      "541.6(b)(3)",
      "Allowed free time",
      "timing",
      invoice.freeTimeDays !== null && invoice.freeTimeDays >= 0,
      "void",
      invoice.freeTimeDays !== null
        ? `${invoice.freeTimeDays} free day${invoice.freeTimeDays === 1 ? "" : "s"} stated.`
        : "Allowed free time in days is missing. 46 CFR 541.6(b)(3).",
    ),
  );
  checks.push(
    check(
      "541.6(b)(4)",
      "Free time start",
      "timing",
      present(invoice.freeTimeStart),
      "void",
      present(invoice.freeTimeStart)
        ? `Free time starts ${invoice.freeTimeStart}.`
        : "Free time start date missing. 46 CFR 541.6(b)(4).",
    ),
  );
  checks.push(
    check(
      "541.6(b)(5)",
      "Free time end",
      "timing",
      present(invoice.freeTimeEnd),
      "void",
      present(invoice.freeTimeEnd)
        ? `Free time ends ${invoice.freeTimeEnd}.`
        : "Free time end date missing. 46 CFR 541.6(b)(5).",
    ),
  );
  if (isImport) {
    checks.push(
      check(
        "541.6(b)(6)",
        "Container availability date",
        "timing",
        present(invoice.availabilityDate),
        "void",
        present(invoice.availabilityDate)
          ? `Stated available ${invoice.availabilityDate}.`
          : "Import invoice omits container availability date. 46 CFR 541.6(b)(6).",
      ),
    );
  }
  if (isExport) {
    checks.push(
      check(
        "541.6(b)(7)",
        "Earliest return date",
        "timing",
        present(invoice.earliestReturnDate),
        "void",
        present(invoice.earliestReturnDate)
          ? `Earliest return ${invoice.earliestReturnDate}.`
          : "Export invoice omits earliest return date. 46 CFR 541.6(b)(7).",
      ),
    );
  }
  const chargeDatesOk = Array.isArray(invoice.chargeDates) && invoice.chargeDates.length > 0;
  checks.push(
    check(
      "541.6(b)(8)",
      "Specific charge dates",
      "timing",
      chargeDatesOk,
      "void",
      chargeDatesOk
        ? `${invoice.chargeDates!.length} charge day${invoice.chargeDates!.length === 1 ? "" : "s"} listed.`
        : "Invoice does not list the specific dates for which demurrage or detention was charged. 46 CFR 541.6(b)(8).",
    ),
  );

  checks.push(
    check(
      "541.6(c)(1)",
      "Total amount due",
      "rate",
      typeof invoice.amountDue === "number" && invoice.amountDue > 0,
      "void",
      invoice.amountDue > 0
        ? `Amount due $${invoice.amountDue.toLocaleString("en-US")}.`
        : "Total amount due missing or zero. 46 CFR 541.6(c)(1).",
    ),
  );
  checks.push(
    check(
      "541.6(c)(2)",
      "Applicable rule",
      "rate",
      present(invoice.tariffRule),
      "void",
      present(invoice.tariffRule)
        ? `Rule ${invoice.tariffRule}.`
        : "No tariff, terminal schedule, or service contract rule cited. 46 CFR 541.6(c)(2).",
    ),
  );
  checks.push(
    check(
      "541.6(c)(3)",
      "Specific daily rate",
      "rate",
      invoice.dailyRate !== null && invoice.dailyRate > 0,
      "void",
      invoice.dailyRate
        ? `$${invoice.dailyRate}/day.`
        : "Specific rate per the applicable rule is missing. 46 CFR 541.6(c)(3).",
    ),
  );

  const hasContact = present(invoice.contactEmail) || present(invoice.contactPhone);
  checks.push(
    check(
      "541.6(d)(1)",
      "Dispute contact",
      "dispute_info",
      hasContact,
      "void",
      hasContact
        ? [invoice.contactEmail, invoice.contactPhone].filter(Boolean).join(" · ")
        : "No email, telephone, or other contact for questions or fee mitigation. 46 CFR 541.6(d)(1).",
    ),
  );
  checks.push(
    check(
      "541.6(d)(2)",
      "Digital dispute process",
      "dispute_info",
      present(invoice.disputeUrl),
      "void",
      present(invoice.disputeUrl)
        ? `Process URL present.`
        : "No URL, QR, or digital means describing how to request mitigation, refund, or waiver. 46 CFR 541.6(d)(2).",
    ),
  );
  const windowOk =
    invoice.disputeWindowDays !== null && invoice.disputeWindowDays >= 30;
  checks.push(
    check(
      "541.6(d)(3)",
      "Defined dispute timeframes",
      "dispute_info",
      windowOk,
      "void",
      windowOk
        ? `${invoice.disputeWindowDays}-day billed-party window stated.`
        : "Invoice does not state defined timeframes that comply with the 30-day dispute clock in 46 CFR 541.8. 46 CFR 541.6(d)(3).",
    ),
  );

  checks.push(
    check(
      "541.6(e)(1)",
      "FMC consistency certification",
      "certification",
      invoice.certFmcConsistent === true,
      "void",
      invoice.certFmcConsistent
        ? "Billing party certified charges are consistent with FMC demurrage and detention rules, including 46 CFR 545.5."
        : "Missing certification that charges are consistent with FMC demurrage and detention rules. 46 CFR 541.6(e)(1).",
    ),
  );
  checks.push(
    check(
      "541.6(e)(2)",
      "Performance certification",
      "certification",
      invoice.certPerformanceClean === true,
      "void",
      invoice.certPerformanceClean
        ? "Billing party certified its performance did not cause or contribute to the charges."
        : "Missing certification that the billing party's performance did not cause or contribute to the invoiced charges. 46 CFR 541.6(e)(2).",
    ),
  );

  const issued = parseDay(invoice.invoiceDate);
  const lastCharge = parseDay(invoice.lastChargeDate);
  let issuanceOk = false;
  let issuanceDetail = "Cannot test issuance clock without invoice date and last charge date.";
  if (issued && lastCharge) {
    const lag = differenceInCalendarDays(issued, lastCharge);
    issuanceOk = lag <= 30;
    issuanceDetail = issuanceOk
      ? `Issued ${lag} day${lag === 1 ? "" : "s"} after last incurred charge.`
      : `Issued ${lag} days after last incurred charge — exceeds the 30-day issuance deadline. Billed party is not required to pay. 46 CFR 541.7(a).`;
  }
  checks.push(
    check(
      "541.7(a)",
      "Issued within 30 days of last charge",
      "issuance",
      issuanceOk,
      "void",
      issuanceDetail,
    ),
  );

  const { terminalAvailable, tmsAvailable, hold } = availabilityGate(invoice, gates);
  let tmsLagHours: number | null = null;
  if (terminalAvailable && tmsAvailable) {
    tmsLagHours = differenceInHours(
      parseDay(tmsAvailable.timestamp) ?? AS_OF,
      parseDay(terminalAvailable.timestamp) ?? AS_OF,
    );
  } else if (invoice.availabilityDate && terminalAvailable) {
    tmsLagHours = differenceInHours(
      parseDay(terminalAvailable.timestamp) ?? AS_OF,
      parseDay(invoice.availabilityDate) ?? AS_OF,
    );
  }

  if (isImport && invoice.availabilityDate && terminalAvailable) {
    const stated = parseDay(invoice.availabilityDate);
    const actual = parseDay(terminalAvailable.timestamp);
    const hoursEarly = stated && actual ? differenceInHours(actual, stated) : 0;
    const accurate = hoursEarly <= 12;
    checks.push(
      check(
        "541.6 accuracy",
        "Availability date matches terminal gate",
        "accuracy",
        accurate,
        "void",
        accurate
          ? "Stated availability is consistent with the terminal gate record."
          : `Invoice states available ${invoice.availabilityDate}, but terminal gate available is ${terminalAvailable.timestamp.replace("T", " ").slice(0, 16)}. 46 CFR 541.6 requires invoices to be accurate — a false availability date voids the obligation to pay under 541.5.`,
      ),
    );
  }

  if (tmsAvailable && terminalAvailable && tmsLagHours !== null && tmsLagHours >= 2) {
    checks.push(
      check(
        "TMS lag",
        "TMS synchronization delay",
        "accuracy",
        false,
        "dispute",
        `TMS posted availability ${tmsLagHours}h after the terminal gate. Compressed drayage window is a documented OSRA pain point, not billed-party delay.`,
      ),
    );
  }

  const incentiveFailed = Boolean(
    hold ||
      invoice.holdReason ||
      (tmsLagHours !== null && tmsLagHours >= 12),
  );
  checks.push(
    check(
      "545.5",
      "Incentive principle",
      "incentive",
      !incentiveFailed,
      "dispute",
      incentiveFailed
        ? hold?.notes ||
            invoice.holdReason ||
            "Charges do not incentivize cargo movement: delay is attributable to terminal/carrier conditions (46 CFR 545.5)."
        : "No terminal hold or carrier-caused delay on the gate tape.",
    ),
  );

  const failedVoid = checks.filter((c) => !c.passed && c.severity === "void");
  const failedDispute = checks.filter((c) => !c.passed && c.severity === "dispute");
  const scored = checks.filter((c) => c.severity !== "info");
  const passedCount = scored.filter((c) => c.passed).length;
  const score = scored.length === 0 ? 100 : Math.round((passedCount / scored.length) * 100);
  const voidable = failedVoid.length > 0;
  const obligationToPay = !voidable && invoice.status !== "recovered";
  const { deadline, daysRemaining, clock } = clockFor(invoice, asOf);

  let recommendedAction: ScanResult["recommendedAction"] = "pay";
  if (invoice.status === "recovered" || invoice.status === "paid") {
    recommendedAction = invoice.status === "paid" ? "pay" : "void_notice";
  } else if (clock === "expired" && invoice.status === "open") {
    recommendedAction = "clock_expired";
  } else if (voidable) {
    recommendedAction = "void_notice";
  } else if (failedDispute.length > 0) {
    recommendedAction = "dispute";
  }

  const recoverable =
    invoice.status === "paid" || invoice.status === "recovered"
      ? 0
      : voidable || failedDispute.length > 0
        ? invoice.amountDue
        : 0;

  return {
    invoiceId: invoice.id,
    obligationToPay,
    voidable,
    score,
    checks,
    failedVoid,
    failedDispute,
    recoverableAmount: recoverable,
    disputeDeadline: deadline,
    daysRemaining,
    clock,
    tmsLagHours,
    recommendedAction,
  };
}

export function categoryLabel(category: CheckCategory) {
  switch (category) {
    case "identifying":
      return "Identifying";
    case "timing":
      return "Timing";
    case "rate":
      return "Rate";
    case "dispute_info":
      return "Dispute info";
    case "certification":
      return "Certifications";
    case "issuance":
      return "Issuance";
    case "accuracy":
      return "Accuracy";
    case "incentive":
      return "Incentive principle";
  }
}

export const OSRA_FIELDS = [
  {
    code: "541.6(a)(1–4)",
    title: "Identifying information",
    body: "Bill of lading number, container number, port of discharge (imports), and the basis for why the billed party is liable.",
  },
  {
    code: "541.6(b)(1–8)",
    title: "Timing information",
    body: "Invoice date and due date, allowed free time in days with start and end dates, container availability date (imports) or earliest return date (exports), and the specific dates charged.",
  },
  {
    code: "541.6(c)(1–3)",
    title: "Rate information",
    body: "Total amount due, the tariff / terminal schedule / service contract rule the daily rate is based on, and the specific rate itself.",
  },
  {
    code: "541.6(d)(1–3)",
    title: "Dispute information",
    body: "Contact for questions or mitigation, a public URL/QR describing required documentation, and defined timeframes that meet the 30-day clocks in this part.",
  },
  {
    code: "541.6(e)(1–2)",
    title: "Certifications",
    body: "That charges are consistent with FMC demurrage and detention rules including 46 CFR 545.5, and that the billing party's own performance did not cause or contribute to the charges.",
  },
  {
    code: "541.5 / 541.7",
    title: "No-pay consequences",
    body: "Missing any required element, or issuing more than 30 days after the last incurred charge, eliminates the billed party's obligation to pay.",
  },
  {
    code: "541.8",
    title: "Thirty-day dispute clock",
    body: "Billed parties must have at least 30 calendar days from invoice issuance to request mitigation, refund, or waiver. Billing parties must attempt to resolve within 30 days of the request.",
  },
  {
    code: "545.5",
    title: "Incentive principle",
    body: "Demurrage and detention are lawful only as incentives to move cargo. Charges that accrue because the terminal, chassis network, or carrier made cargo immovable are disputable even when the form of the invoice is complete.",
  },
] as const;
