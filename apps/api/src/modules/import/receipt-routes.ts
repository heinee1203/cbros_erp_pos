import type { FastifyInstance } from "fastify";
import {
  executeReceiptsImport,
  parseReceiptsCSV,
  type ReceiptsExecuteOptions,
} from "./receipts-import";
import { MANAGE_ROLES } from "./route-permissions";

export function registerReceiptImportRoutes(app: FastifyInstance) {
  app.post(
    "/receipts-preview",
    {
      config: { bodyLimit: 50 * 1024 * 1024 },
      schema: {
        body: {
          type: "object",
          required: ["csvText"],
          properties: { csvText: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }
      const { csvText } = request.body as { csvText: string };
      const { orgId } = request.storeContext!;
      try {
        const result = await parseReceiptsCSV(csvText, orgId);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message || "Failed to parse receipts CSV" });
      }
    },
  );

  app.post(
    "/receipts-execute",
    {
      schema: {
        body: {
          type: "object",
          required: ["previewToken"],
          properties: {
            previewToken: { type: "string" },
            locationMapping: { type: "object", additionalProperties: { type: "string" } },
            skipVoided: { type: "boolean" },
            skipCustomerCount: { type: "boolean" },
            skipZeroQty: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }
      const body = request.body as ReceiptsExecuteOptions;
      try {
        const result = await executeReceiptsImport(body);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(500).send({ error: err.message || "Import failed" });
      }
    },
  );
}
