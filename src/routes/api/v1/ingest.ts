import { createFileRoute } from "@tanstack/react-router";
import { scanResponse } from "@/lib/api-shape";
import { detectFormat, formatLabel, parseNative } from "@/lib/connectors";
import { buildDisputeLetter } from "@/lib/dispute-letter";
import { scanInvoice } from "@/lib/osra";

export const Route = createFileRoute("/api/v1/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          const trimmed = text.trim();
          const raw: string | unknown =
            trimmed.startsWith("{") || trimmed.startsWith("[") ? (JSON.parse(text) as unknown) : text;
          const parsed = parseNative(raw);
          const results = parsed.invoices.map((invoice) => {
            const scan = scanInvoice(invoice, parsed.gates);
            return {
              invoice_number: invoice.invoiceNumber,
              container: invoice.containerNumber,
              source: invoice.sourceConnector ?? null,
              ...scanResponse(scan),
              dispute_letter:
                scan.recommendedAction === "pay" ? null : buildDisputeLetter(invoice, scan),
            };
          });
          return Response.json({
            ok: true,
            format: parsed.format,
            format_label: formatLabel(parsed.format),
            invoices: results.length,
            gates: parsed.gates.length,
            warnings: parsed.warnings,
            results,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid payload";
          return Response.json({ ok: false, error: message }, { status: 400 });
        }
      },
    },
  },
});
