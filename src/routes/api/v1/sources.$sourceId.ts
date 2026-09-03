import { createFileRoute } from "@tanstack/react-router";
import { pullOpen } from "@/lib/connectors/open-live";

export const Route = createFileRoute("/api/v1/sources/$sourceId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const pulled = await pullOpen(params.sourceId);
          return Response.json({
            ok: true,
            ...pulled,
            counts: {
              terminals: pulled.terminals?.length ?? 0,
              port_calls: pulled.portCalls?.length ?? 0,
              vessels: pulled.vesselCalls?.length ?? 0,
              alerts: pulled.alerts?.length ?? 0,
              harbor: pulled.harbor ? 1 : 0,
              forecast: pulled.forecast ? 1 : 0,
              hours: pulled.gateHours ? 1 : 0,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Live pull failed";
          return Response.json({ ok: false, error: message }, { status: 502 });
        }
      },
    },
  },
});
