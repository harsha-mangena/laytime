import { createFileRoute } from "@tanstack/react-router";
import { OSRA_FIELDS } from "@/lib/osra";

export const Route = createFileRoute("/api/v1/rules")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          regulation: "46 CFR Part 541",
          note: "Failure to include required invoice contents, or to issue within 30 days of the last incurred charge, eliminates the billed party's obligation to pay. 46 CFR 541.5, 541.7.",
          fields: OSRA_FIELDS,
        });
      },
    },
  },
});
