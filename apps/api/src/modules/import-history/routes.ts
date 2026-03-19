import type { FastifyPluginAsync } from "fastify";
import {
  parseLoyverseHistory,
  executeHistoryImport,
  getProgress,
  listBatches,
  deleteBatch,
  type ExecuteHistoryOptions,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const importHistoryRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /preview — parse CSV and return preview ───────────────────
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
        const result = await parseLoyverseHistory(csvText, orgId);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply
          .status(400)
          .send({ error: err.message || "Failed to parse CSV" });
      }
    },
  );

  // ── POST /execute — run the import ─────────────────────────────────
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
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const body = request.body as ExecuteHistoryOptions;

      try {
        const result = await executeHistoryImport(body);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply
          .status(400)
          .send({ error: err.message || "Import failed" });
      }
    },
  );

  // ── GET /progress/:token — poll import progress ────────────────────
  app.get(
    "/progress/:token",
    {
      schema: {
        params: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const progress = getProgress(token);

      if (!progress) {
        return reply
          .status(404)
          .send({ error: "No import in progress for this token" });
      }

      return reply.status(200).send(progress);
    },
  );

  // ── GET /batches — list import batches ─────────────────────────────
  app.get("/batches", async (request, reply) => {
    if (!MANAGE_ROLES.includes(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const orgId = request.user.orgId;

    try {
      const batches = await listBatches(orgId);
      return reply.status(200).send({ data: batches });
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Failed to list batches" });
    }
  });

  // ── DELETE /batches/:batchId — delete a batch ──────────────────────
  app.delete(
    "/batches/:batchId",
    {
      schema: {
        params: {
          type: "object",
          required: ["batchId"],
          properties: {
            batchId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const { batchId } = request.params as { batchId: string };
      const orgId = request.user.orgId;

      try {
        const result = await deleteBatch(orgId, batchId);
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply
          .status(500)
          .send({ error: err.message || "Failed to delete batch" });
      }
    },
  );
};
