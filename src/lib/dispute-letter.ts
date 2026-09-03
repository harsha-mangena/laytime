import { DESK } from "./seed";
import { money, shortDate, containerPretty } from "./format";
import { AS_OF_ISO } from "./as-of";
import type { Invoice, ScanResult } from "./types";

export function buildDisputeLetter(invoice: Invoice, scan: ScanResult) {
  const grounds = [...scan.failedVoid, ...scan.failedDispute];
  const citations = Array.from(new Set(grounds.map((g) => g.code)));
  const obligation = scan.voidable
    ? "Because the invoice fails one or more required elements of 46 CFR 541.6 (or the issuance clock in 541.7), Northbridge Logistics LLC has no obligation to pay the invoiced charges. 46 CFR 541.5."
    : "The invoice is formally complete, but the underlying charges violate the incentive principle in 46 CFR 545.5. We request mitigation, refund, or waiver under 46 CFR 541.8.";

  const bullets = grounds
    .map((g) => `    • ${g.code} — ${g.label}. ${g.detail}`)
    .join("\n");

  return [
    DESK.org.toUpperCase(),
    DESK.address,
    `${DESK.phone}  ·  ${DESK.email}`,
    `SCAC ${DESK.scac}`,
    "",
    shortDate(AS_OF_ISO),
    "",
    `Billing party: ${invoice.billingParty} (${invoice.billingPartyType})`,
    `Re: Dispute of ${invoice.chargeType} invoice ${invoice.invoiceNumber}`,
    `    Container ${containerPretty(invoice.containerNumber)}  ·  Amount ${money(invoice.amountDue)}`,
    invoice.bolNumber ? `    Bill of lading ${invoice.bolNumber}` : "    Bill of lading: not stated on invoice",
    "",
    "NOTICE OF DISPUTE — DEMURRAGE / DETENTION CHARGES",
    "Ocean Shipping Reform Act of 2022  ·  46 CFR Part 541  ·  46 CFR 545.5",
    "",
    `To whom it may concern,`,
    "",
    `Northbridge Logistics LLC disputes invoice ${invoice.invoiceNumber} in full. This request is made within thirty (30) calendar days of invoice issuance as required by 46 CFR 541.8(a).`,
    "",
    obligation,
    "",
    "Grounds, as determined by a field-level OSRA 2022 scan of the invoice against terminal gate records:",
    "",
    bullets || "    • No field-level defects. Review requested on operational facts.",
    "",
    citations.length
      ? `Regulations cited: ${citations.join(", ")}.`
      : "Regulations cited: 46 CFR 545.5.",
    "",
    scan.tmsLagHours !== null && scan.tmsLagHours >= 2
      ? `Terminal-to-TMS lag on this box was ${scan.tmsLagHours} hours. OSRA 2022 does not permit billing parties to charge for time the cargo was not actually available to the merchant, including delays created by the billing party's own systems or terminal conditions.`
      : null,
    "",
    `We request that ${invoice.billingParty} waive or refund ${money(invoice.amountDue)} and confirm in writing within thirty (30) calendar days per 46 CFR 541.8(b).`,
    "",
    "Please direct the resolution to the undersigned. Supporting gate tape and the machine-readable scan result are attached to the electronic copy of this notice.",
    "",
    "Respectfully,",
    "",
    DESK.manager,
    DESK.title,
    DESK.org,
    DESK.desk,
    "",
    `Dispute deadline on this invoice: ${scan.disputeDeadline ? shortDate(scan.disputeDeadline) : "not determinable"}.`,
    `Laytime scan score: ${scan.score}/100. Obligation to pay: ${scan.obligationToPay ? "YES" : "NO"}.`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function disputeGrounds(scan: ScanResult) {
  return [...scan.failedVoid, ...scan.failedDispute].map((c) => `${c.code} ${c.label}`);
}
