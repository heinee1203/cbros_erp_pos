import type { FastifyInstance } from "fastify";
import { assertApRole } from "./route-support";
import {
  bounceCheck,
  cancelCheck,
  clearCheck,
  getCheckRegister,
  getSummary,
  releaseCheck,
} from "./report-service";

export function registerReportCheckRegisterRoutes(app: FastifyInstance) {
  app.get("/reports/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getSummary(orgId);
    return reply.send(result);
  });

  app.get("/reports/pdcs", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getCheckRegister(orgId);
    return reply.send(result);
  });

  app.get("/check-register", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;
    const result = await getCheckRegister(orgId, {
      search: q.search,
      bank: q.bank,
      status: q.status,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
    return reply.send(result);
  });

  app.post("/check-register/:id/release", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      return reply.send(await releaseCheck(orgId, (request.params as any).id));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-register/:id/clear", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      return reply.send(await clearCheck(orgId, (request.params as any).id));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-register/:id/bounce", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { reason } = (request.body as any) ?? {};
    if (!reason) {
      return reply.status(400).send({ error: "Bounce reason is required" });
    }

    try {
      return reply.send(await bounceCheck(orgId, (request.params as any).id, reason));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-register/:id/cancel", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      return reply.send(await cancelCheck(orgId, (request.params as any).id));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
