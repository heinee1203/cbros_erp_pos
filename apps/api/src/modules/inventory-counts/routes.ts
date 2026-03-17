import type { FastifyPluginAsync } from "fastify";
import {
  paginationSchema,
  createCountSchema,
  recordCountLineSchema,
  postCountSchema,
} from "@apex/types";
import {
  listCountSessions,
  createCountSession,
  getCountDetail,
  recordLineCount,
  completeCount,
  reviewCount,
  postCountVariances,
  cancelCount,
} from "./service";

const VALID_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "COMPLETED",
  "REVIEWED",
  "POSTED",
  "CANCELLED",
];

const ALLOWED_ROLES = ["ADMIN", "MANAGER", "WAREHOUSE_STAFF"];
const REVIEW_ROLES = ["ADMIN", "MANAGER"];

export const inventoryCountRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /inventory/counts
   * List count sessions (paginated, filterable)
   */
  app.get("/", async (request, reply) => {
    const pageParsed = paginationSchema.safeParse(request.query);
    if (!pageParsed.success) {
      return reply.status(400).send({
        error: "Invalid pagination params",
        details: pageParsed.error.flatten(),
      });
    }

    const { cursor, limit } = pageParsed.data;
    const { orgId, locationId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations) {
      const userRole = (request.user as any)?.role;
      if (userRole !== "ADMIN" && userRole !== "MANAGER") {
        return reply.status(403).send({
          error: "Cross-location access requires ADMIN or MANAGER role",
        });
      }
    }

    if (q.status && !VALID_STATUSES.includes(q.status)) {
      return reply.status(400).send({ error: `Invalid status: ${q.status}` });
    }

    const result = await listCountSessions({
      orgId,
      locationId: locationId ?? "",
      allLocations,
      overrideLocationId: q.locationId,
      status: q.status,
      search: q.search,
      cursor,
      limit,
    });

    return reply.send(result);
  });

  /**
   * POST /inventory/counts
   * Create a new count session
   */
  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!ALLOWED_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Insufficient role to create inventory counts",
      });
    }

    const parsed = createCountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.userId;

    try {
      const result = await createCountSession(parsed.data, orgId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * GET /inventory/counts/:countId
   * Get count session detail with paginated lines
   */
  app.get("/:countId", async (request, reply) => {
    const { countId } = request.params as { countId: string };
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const pageParsed = paginationSchema.safeParse(request.query);
    const { cursor, limit } = pageParsed.success
      ? pageParsed.data
      : { cursor: undefined, limit: 100 };

    try {
      const result = await getCountDetail({
        orgId,
        countId,
        search: q.search,
        varianceOnly: q.varianceOnly === "true",
        uncountedOnly: q.uncountedOnly === "true",
        cursor,
        limit,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  /**
   * PATCH /inventory/counts/:countId/lines/:lineId
   * Record a physical count on a line
   */
  app.patch("/:countId/lines/:lineId", async (request, reply) => {
    const { countId, lineId } = request.params as {
      countId: string;
      lineId: string;
    };

    const parsed = recordCountLineSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.userId;

    try {
      const result = await recordLineCount(
        countId,
        lineId,
        parsed.data,
        orgId,
        userId,
      );
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  /**
   * POST /inventory/counts/:countId/complete
   * Transition: IN_PROGRESS → COMPLETED
   */
  app.post("/:countId/complete", async (request, reply) => {
    const { countId } = request.params as { countId: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await completeCount(countId, orgId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * POST /inventory/counts/:countId/review
   * Transition: COMPLETED → REVIEWED (ADMIN/MANAGER only)
   */
  app.post("/:countId/review", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!REVIEW_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can review counts",
      });
    }

    const { countId } = request.params as { countId: string };
    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.userId;

    try {
      const result = await reviewCount(countId, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * POST /inventory/counts/:countId/post
   * Transition: REVIEWED → POSTED (creates journal entries for variances)
   */
  app.post("/:countId/post", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!REVIEW_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can post count variances",
      });
    }

    const parsed = postCountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { countId } = request.params as { countId: string };
    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.userId;

    try {
      const result = await postCountVariances(
        countId,
        parsed.data,
        orgId,
        userId,
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message.includes("idempotency") || err.message.includes("unique")) {
        return reply.status(409).send({
          error: "This post operation has already been processed",
        });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * POST /inventory/counts/:countId/cancel
   * Cancel a count session
   */
  app.post("/:countId/cancel", async (request, reply) => {
    const { countId } = request.params as { countId: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await cancelCount(countId, orgId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
