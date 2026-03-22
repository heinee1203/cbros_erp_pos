import type { FastifyPluginAsync } from "fastify";
import {
  parseLoyverseCSV,
  executeImport,
  getProgress,
  type ExecuteOptions,
} from "./service";
import { db } from "@apex/database";
import { sql, eq, and } from "drizzle-orm";

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
            categoryMapping: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["create", "map"] },
                  targetCategoryId: { type: "string" },
                  targetSubcategoryId: { type: "string" },
                  familyId: { type: "string" },
                  createSubcategory: { type: "boolean" },
                },
              },
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

  // ── GET /location-mappings — get saved location mappings ──────────
  app.get("/location-mappings", async (request, reply) => {
    const orgId = request.user.orgId;
    const rows = await db.execute(
      sql`SELECT csv_location_name, apex_location_id FROM import_location_mappings WHERE org_id = ${orgId} ORDER BY csv_location_name`,
    );
    const mappings: Record<string, string> = {};
    for (const row of rows) {
      mappings[(row as any).csv_location_name] = (row as any).apex_location_id;
    }
    return reply.send({ mappings });
  });

  // ── POST /save-location-mappings — save location mappings ─────────
  app.post("/save-location-mappings", async (request, reply) => {
    if (!MANAGE_ROLES.includes(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
    const orgId = request.user.orgId;
    const { mappings } = request.body as { mappings: Record<string, string> };
    if (!mappings || typeof mappings !== "object") {
      return reply.status(400).send({ error: "mappings object required" });
    }

    for (const [csvName, apexLocationId] of Object.entries(mappings)) {
      if (!csvName || !apexLocationId) continue;
      await db.execute(
        sql`INSERT INTO import_location_mappings (org_id, csv_location_name, apex_location_id)
            VALUES (${orgId}, ${csvName}, ${apexLocationId})
            ON CONFLICT (org_id, csv_location_name)
            DO UPDATE SET apex_location_id = ${apexLocationId}, updated_at = NOW()`,
      );
    }

    return reply.send({ success: true, saved: Object.keys(mappings).length });
  });
};
