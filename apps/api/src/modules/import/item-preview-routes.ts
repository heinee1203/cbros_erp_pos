import type { FastifyInstance } from "fastify";
import { parseLoyverseCSV } from "./item-preview-route-service";
import { MANAGE_ROLES } from "./route-permissions";

export function registerItemPreviewRoutes(app: FastifyInstance) {
  app.post(
    "/preview",
    {
      schema: {
        body: {
          type: "object",
          required: ["csvText"],
          properties: {
            csvText: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const { csvText } = request.body as { csvText: string };
      if (!csvText || csvText.length === 0) {
        return reply.status(400).send({ error: "csvText is required" });
      }

      const orgId = request.user.orgId;

      try {
        const result = await parseLoyverseCSV(csvText, orgId);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply
          .status(400)
          .send({ error: err.message || "Failed to parse CSV" });
      }
    },
  );
}
