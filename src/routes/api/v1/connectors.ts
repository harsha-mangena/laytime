import { createFileRoute } from "@tanstack/react-router";
import { CONNECTORS, KIND_LABEL } from "@/lib/connectors";

export const Route = createFileRoute("/api/v1/connectors")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          ingest: "/api/v1/ingest",
          scan: "/api/v1/scan",
          connectors: CONNECTORS.map((c) => ({
            id: c.id,
            name: c.name,
            vendor: c.vendor,
            kind: c.kind,
            kind_label: KIND_LABEL[c.kind],
            protocol: c.protocol,
            format: c.format,
            endpoint: c.endpoint,
          })),
        });
      },
    },
  },
});
