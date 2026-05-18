import type { FastifyInstance } from "fastify";
import { getProgress } from "./import-history-route-service";

export async function registerImportHistoryProgressRoutes(app: FastifyInstance) {
  // GET /progress/:token - poll import progress
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
