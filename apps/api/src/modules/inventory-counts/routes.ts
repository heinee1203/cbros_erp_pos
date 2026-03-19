import type { FastifyPluginAsync } from "fastify";
import {
  createCountSchema,
  recordCountItemsSchema,
  completeCountSchema,
  cancelCountSchema,
} from "@apex/types";
import { parseQuery } from "../../lib/validate-query";
import { z } from "zod";
import {
  listCounts,
  getCount,
  getCountItems,
  createCount,
  deleteCount,
  startCount,
  recordItems,
  submitReview,
  completeCount,
  cancelCount,
} from "./service";

const MANAGER_ROLES = ["ADMIN", "MANAGER"];

const countsQuerySchema = z.object({
  status: z.string().optional(),
  locationId: z.string().uuid().optional(),
  countType: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});

const countItemsQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const inventoryCountRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET / ─── List counts
  app.get("/", async (request, reply) => {
    const q = parseQuery(countsQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !MANAGER_ROLES.includes(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listCounts(orgId, {
      locationId: allLocations ? q.locationId : (locationId ?? undefined),
      status: q.status,
      countType: q.countType,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      search: q.search,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // ─── GET /:id ─── Get count detail
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await getCount(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ─── GET /:id/items ─── Get count items (paginated)
  app.get("/:id/items", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const q = parseQuery(countItemsQuerySchema, request.query, reply);
    if (!q) return;

    try {
      const result = await getCountItems(orgId, id, {
        status: q.status,
        search: q.search,
        cursor: q.cursor,
        limit: q.limit,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ─── POST / ─── Create count (ADMIN/MANAGER)
  app.post("/", async (request, reply) => {
    const { role, userId } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role to create inventory counts" });
    }

    const parsed = createCountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply
        .status(400)
        .send({ error: "X-Location-ID header is required to create a count" });
    }

    try {
      const result = await createCount(orgId, locationId, userId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /:id ─── Delete count (DRAFT only, ADMIN/MANAGER)
  app.delete("/:id", async (request, reply) => {
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role to delete inventory counts" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await deleteCount(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  // ─── POST /:id/start ─── Start count (ADMIN/MANAGER)
  app.post("/:id/start", async (request, reply) => {
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role to start inventory counts" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await startCount(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  // ─── POST /:id/record ─── Record items (ALL roles)
  app.post("/:id/record", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId } = request.user;

    const parsed = recordCountItemsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await recordItems(orgId, id, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  // ─── POST /:id/submit-review ─── Submit for review (ADMIN/MANAGER)
  app.post("/:id/submit-review", async (request, reply) => {
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role to submit for review" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await submitReview(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  // ─── POST /:id/complete ─── Complete count (ADMIN/MANAGER, requires approvalPin)
  app.post("/:id/complete", async (request, reply) => {
    const { role, userId } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role to complete inventory counts" });
    }

    const parsed = completeCountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await completeCount(orgId, id, userId);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  // ─── POST /:id/cancel ─── Cancel count (ADMIN/MANAGER)
  app.post("/:id/cancel", async (request, reply) => {
    const { role, userId } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role to cancel inventory counts" });
    }

    const parsed = cancelCountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await cancelCount(orgId, id, userId, parsed.data.reason);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });
};
