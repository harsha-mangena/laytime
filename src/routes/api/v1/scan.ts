import { createFileRoute } from "@tanstack/react-router";
import { scanResponse } from "@/lib/api-shape";
import { normalizeGates, normalizeInvoice } from "@/lib/ingest";
import { scanInvoice } from "@/lib/osra";
import { buildDisputeLetter } from "@/lib/dispute-letter";

export const Route = createFileRoute("/api/v1/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const invoiceRaw =
            body.invoice && typeof body.invoice === "object"
              ? (body.invoice as Record<string, unknown>)
              : body;
          const invoice = normalizeInvoice(invoiceRaw);
          const gates = normalizeGates(body.gates, invoice.containerNumber);
          const scan = scanInvoice(invoice, gates);
          return Response.json({
            ok: true,
            invoice_number: invoice.invoiceNumber,
            container: invoice.containerNumber,
            ...scanResponse(scan),
            dispute_letter: scan.recommendedAction === "pay" ? null : buildDisputeLetter(invoice, scan),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid payload";
          return Response.json({ ok: false, error: message }, { status: 400 });
        }
      },
    },
  },
});
