import type { FastifyInstance } from "fastify";
import {
  buildHealthErrorResponse,
  buildHealthOkResponse,
} from "./health-route-helpers";
import { assertDatabaseConnected } from "./health-route-service";

export async function registerHealthReadRoutes(app: FastifyInstance) {
  app.get("/", async (_request, reply) => {
    try {
      await assertDatabaseConnected();
      return reply.send(buildHealthOkResponse());
    } catch {
      return reply.status(503).send(buildHealthErrorResponse());
    }
  });
}
