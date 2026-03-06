import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: "connected",
      });
    } catch {
      return reply.status(503).send({
        status: "error",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      });
    }
  });
};
