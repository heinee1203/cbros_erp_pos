import type { FastifyPluginAsync } from "fastify";
import {
  createServiceOperationSchema,
  updateServiceOperationSchema,
  createJobCardSchema,
  checkInJobCardSchema,
  addLaborSchema,
  addPartsSchema,
  updatePartQtySchema,
  approveJobCardSchema,
  issuePartsSchema,
  returnPartsSchema,
  cancelJobCardSchema,
  transitionJobCardSchema,
  paginationSchema,
  SERVICE_ROLES,
  JobCardStatus,
} from "@apex/types";
import {
  // Service operations
  createServiceOperation,
  updateServiceOperation,
  listServiceOperations,
  getServiceOperation,
  // Job cards
  createJobCard,
  transitionJobCard,
  addLabor,
  addParts,
  updatePartQty,
  approveJobCard,
  issueParts,
  returnParts,
  cancelJobCard,
  getJobCard,
  getJobCardByNumber,
  listJobCards,
  getJobCardJournal,
} from "./service";

/** Classify errors for correct HTTP status codes */
function isIdempotencyError(err: Error): boolean {
  return (
    err.message.includes("duplicate key") ||
    err.message.includes("already exists") ||
    err.message.includes("idempotency")
  );
}

function isContentionError(err: Error): boolean {
  return (
    err.message.includes("could not obtain lock") ||
    err.message.includes("deadlock") ||
    err.message.includes("Row is locked")
  );
}

export const jobCardRoutes: FastifyPluginAsync = async (app) => {
  // ═══════════════════════════════════════════════
  // Service Operations CRUD
  // ═══════════════════════════════════════════════

  // POST /job-cards/service-operations
  app.post("/service-operations", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    const parsed = createServiceOperationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createServiceOperation(parsed.data, orgId, role);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /job-cards/service-operations/:id
  app.patch("/service-operations/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = updateServiceOperationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await updateServiceOperation(id, orgId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /job-cards/service-operations
  app.get("/service-operations", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid pagination params" });
    }

    const result = await listServiceOperations(orgId, parsed.data.cursor, parsed.data.limit);
    return reply.send(result);
  });

  // GET /job-cards/service-operations/:id
  app.get("/service-operations/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const result = await getServiceOperation(id, orgId);
    if (!result) return reply.status(404).send({ error: "Service operation not found" });
    return reply.send(result);
  });

  // ═══════════════════════════════════════════════
  // Job Card CRUD & State Machine
  // ═══════════════════════════════════════════════

  // POST /job-cards — Create a new job card (SCHEDULED)
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = createJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createJobCard(parsed.data, orgId, userId, role);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /job-cards — List job cards
  app.get("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as { cursor?: string; limit?: string };
    const parsed = paginationSchema.safeParse(query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid pagination params" });
    }

    const result = await listJobCards(orgId, locationId || undefined, parsed.data.cursor, parsed.data.limit);
    return reply.send(result);
  });

  // GET /job-cards/:id — Get job card by ID
  app.get("/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const result = await getJobCard(id, orgId);
    if (!result) return reply.status(404).send({ error: "Job card not found" });
    return reply.send(result);
  });

  // GET /job-cards/by-number/:jobNo — Get job card by public number
  app.get("/by-number/:jobNo", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { jobNo } = request.params as { jobNo: string };

    const result = await getJobCardByNumber(jobNo, orgId);
    if (!result) return reply.status(404).send({ error: "Job card not found" });
    return reply.send(result);
  });

  // POST /job-cards/:id/check-in — SCHEDULED → CHECKED_IN
  app.post("/:id/check-in", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.CHECKED_IN,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/start-estimating — CHECKED_IN → ESTIMATING
  app.post("/:id/start-estimating", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.ESTIMATING,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/labor — Add labor lines
  app.post("/:id/labor", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = addLaborSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await addLabor(id, orgId, userId, role, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/parts — Add part lines
  app.post("/:id/parts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = addPartsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await addParts(id, orgId, userId, role, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /job-cards/parts/:partId/qty — Update planned qty (scope expansion)
  app.patch("/parts/:partId/qty", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { partId } = request.params as { partId: string };

    const parsed = updatePartQtySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await updatePartQty(
        partId, orgId, userId, role,
        parsed.data.plannedQty,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/approve — ESTIMATING → APPROVED (partial reservation)
  app.post("/:id/approve", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = approveJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await approveJobCard(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/move-to-bay — WAITING_FOR_PARTS → READY_FOR_BAY
  app.post("/:id/move-to-bay", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.READY_FOR_BAY,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/start-work — READY_FOR_BAY → IN_PROGRESS
  app.post("/:id/start-work", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.IN_PROGRESS,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/issue-parts — Issue parts (THE DEDUCTION MOMENT)
  app.post("/:id/issue-parts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = issuePartsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await issueParts(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/return-parts — Return parts (JOB_CARD_RETURN)
  app.post("/:id/return-parts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = returnPartsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await returnParts(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/complete-work — IN_PROGRESS → WORK_COMPLETED
  app.post("/:id/complete-work", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.WORK_COMPLETED,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/invoice — WORK_COMPLETED → INVOICED
  app.post("/:id/invoice", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.INVOICED,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/close — INVOICED → CLOSED
  app.post("/:id/close", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.CLOSED,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/cancel — Any pre-INVOICED → CANCELLED
  app.post("/:id/cancel", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = cancelJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await cancelJobCard(
        id, orgId, userId, role,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /job-cards/:id/journal — Get stock journal entries
  app.get("/:id/journal", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const entries = await getJobCardJournal(id, orgId);
    return reply.send(entries);
  });
};
