import type { FastifyInstance } from "fastify";
import {
  executeHistoryImport,
  parseLoyverseHistory,
  type ExecuteHistoryOptions,
} from "./import-history-route-service";
import {
  canManageImportHistory,
  getImportHistoryErrorMessage,
  type ImportHistoryPreviewBody,
} from "./import-history-route-helpers";

export async function registerImportHistoryImportRoutes(app: FastifyInstance) {
  // POST /preview - parse CSV and return preview
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
      if (!canManageImportHistory(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const { csvText } = request.body as ImportHistoryPreviewBody;
      if (!csvText || csvText.length === 0) {
        return reply.status(400).send({ error: "csvText is required" });
      }

      const orgId = request.user.orgId;

      try {
        const result = await parseLoyverseHistory(csvText, orgId);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        return reply.status(400).send({
          error: getImportHistoryErrorMessage(err, "Failed to parse CSV"),
        });
      }
    },
  );

  // POST /execute - run the import
  app.post(
    "/execute",
    {
      schema: {
        body: {
          type: "object",
          required: ["previewToken"],
          properties: {
            previewToken: { type: "string" },
            locationMapping: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!canManageImportHistory(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const body = request.body as ExecuteHistoryOptions;

      try {
        const result = await executeHistoryImport(body);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        return reply.status(400).send({
          error: getImportHistoryErrorMessage(err, "Import failed"),
        });
      }
    },
  );
}
