import type { FastifyPluginAsync } from "fastify";
import {
  parseLoyverseCSV,
  executeImport,
  getProgress,
  type ExecuteOptions,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const importRoutes: FastifyPluginAsync = async (app) => {
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
        const result = await parseLoyverseCSV(csvText, orgId);
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
            skipErrors: { type: "boolean" },
            createNewCategories: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const body = request.body as ExecuteOptions;

      try {
        const result = await executeImport(body);
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
};
