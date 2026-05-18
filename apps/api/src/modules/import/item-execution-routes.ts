import type { FastifyInstance } from "fastify";
import {
  executeImport,
  getProgress,
} from "./item-execution-route-service";
import { MANAGE_ROLES } from "./route-permissions";
import type { ExecuteOptions } from "./types";

export function registerItemExecutionRoutes(app: FastifyInstance) {
  app.post(
    "/execute",
    {
      schema: {
        body: {
          type: "object",
          required: ["previewToken"],
          properties: {
            previewToken: { type: "string" },
            fileName: { type: "string" },
            locationMapping: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            categoryMapping: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["create", "map", "skip"] },
                  targetCategoryId: { type: "string" },
                  targetSubcategoryId: { type: "string" },
                  familyId: { type: "string" },
                  createSubcategory: { type: "boolean" },
                },
              },
            },
            importMode: { type: "string", enum: ["smart_sync", "create_only", "update_only", "inventory_sync"] },
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
        const result = await executeImport({
          ...body,
          userId: request.user.userId,
          ipAddress: request.ip,
        });
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply
          .status(400)
          .send({ error: err.message || "Import failed" });
      }
    },
  );

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
}
