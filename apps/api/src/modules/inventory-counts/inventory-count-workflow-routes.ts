import type { FastifyInstance } from "fastify";
import {
  cancelCountSchema,
  completeCountSchema,
  createCountSchema,
  recordCountItemsSchema,
} from "@apex/types";
import {
  getInventoryCountErrorStatus,
  isInventoryCountManager,
} from "./inventory-count-route-helpers";
import {
  cancelCount,
  completeCount,
  createCount,
  deleteCount,
  recordItems,
  startCount,
  submitReview,
} from "./inventory-count-workflow-service";

export async function registerInventoryCountWorkflowRoutes(app: FastifyInstance) {
  // Create count (ADMIN/MANAGER)
  app.post("/", async (request, reply) => {
    const { role, userId } = request.user;
    if (!isInventoryCountManager(role)) {
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

  // Delete count (DRAFT only, ADMIN/MANAGER)
  app.delete("/:id", async (request, reply) => {
    const { role } = request.user;
    if (!isInventoryCountManager(role)) {
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
      return reply.status(getInventoryCountErrorStatus(err)).send({ error: err.message });
    }
  });

  // Start count (ADMIN/MANAGER)
  app.post("/:id/start", async (request, reply) => {
    const { role } = request.user;
    if (!isInventoryCountManager(role)) {
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
      return reply.status(getInventoryCountErrorStatus(err)).send({ error: err.message });
    }
  });

  // Record items (ALL roles)
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
      return reply.status(getInventoryCountErrorStatus(err)).send({ error: err.message });
    }
  });

  // Submit for review (ADMIN/MANAGER)
  app.post("/:id/submit-review", async (request, reply) => {
    const { role } = request.user;
    if (!isInventoryCountManager(role)) {
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
      return reply.status(getInventoryCountErrorStatus(err)).send({ error: err.message });
    }
  });

  // Complete count (ADMIN/MANAGER, requires approvalPin)
  app.post("/:id/complete", async (request, reply) => {
    const { role, userId } = request.user;
    if (!isInventoryCountManager(role)) {
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
      return reply.status(getInventoryCountErrorStatus(err)).send({ error: err.message });
    }
  });

  // Cancel count (ADMIN/MANAGER)
  app.post("/:id/cancel", async (request, reply) => {
    const { role, userId } = request.user;
    if (!isInventoryCountManager(role)) {
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
      return reply.status(getInventoryCountErrorStatus(err)).send({ error: err.message });
    }
  });
}
