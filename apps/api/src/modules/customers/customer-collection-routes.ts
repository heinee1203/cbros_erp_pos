import type { FastifyInstance } from "fastify";
import { createCustomerSchema } from "@apex/types";
import { createCustomer, listCustomers } from "./customer-collection-service";
import { assertAdmin, assertArRole } from "./route-support";
import {
  applyCustomerMerge,
  createCustomerCollectionNote,
  createCustomerDispute,
  getCustomerCollectionsReport,
  getCustomerCreditControl,
  getCustomerMergePreview,
  getCustomerTimeline,
  listCustomerCollectionNotes,
  listCustomerDocuments,
  listCustomerDisputes,
  updateCustomerCreditControl,
  updateCustomerCollectionNote,
  updateCustomerDispute,
} from "./customer-safety-service";

export function registerCustomerCollectionRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { search, type, hasBalance, sortBy, cursor, limit, dateFrom, dateTo } =
      request.query as {
        search?: string;
        type?: string;
        hasBalance?: string;
        sortBy?: string;
        cursor?: string;
        limit?: string;
        dateFrom?: string;
        dateTo?: string;
      };

    const parsedLimit = Math.min(parseInt(limit || "50", 10) || 50, 200);

    const result = await listCustomers(orgId, {
      search,
      type,
      hasBalance: hasBalance === "true",
      sortBy,
      cursor,
      limit: parsedLimit,
      dateFrom,
      dateTo,
    });

    return reply.send(result);
  });

  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);

    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const customer = await createCustomer(parsed.data, orgId);
      return reply.status(201).send(customer);
    } catch (err: any) {
      const errStr =
        String(err.message ?? "") +
        String(err.cause?.message ?? "") +
        String(err.cause?.code ?? "");
      const isUnique =
        err.code === "23505" ||
        err.cause?.code === "23505" ||
        errStr.includes("unique") ||
        errStr.includes("duplicate key") ||
        errStr.includes("23505");
      if (isUnique) {
        return reply
          .status(409)
          .send({ error: "A customer with this phone number already exists" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/:id/collection-notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const data = await listCustomerCollectionNotes(id, orgId);
    return reply.send({ data });
  });

  app.post("/:id/collection-notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertArRole(role);
    const body = request.body as {
      noteType?: string;
      contactMethod?: string | null;
      outcome?: string | null;
      priority?: string | null;
      note?: string;
      promisedAmount?: string | number | null;
      promiseToPayDate?: string | null;
      followUpAt?: string | null;
      assignedToUserId?: string | null;
    };
    try {
      const note = await createCustomerCollectionNote(id, orgId, userId, {
        noteType: body.noteType,
        contactMethod: body.contactMethod,
        outcome: body.outcome,
        priority: body.priority,
        note: body.note ?? "",
        promisedAmount: body.promisedAmount,
        promiseToPayDate: body.promiseToPayDate,
        followUpAt: body.followUpAt,
        assignedToUserId: body.assignedToUserId,
      });
      return reply.status(201).send(note);
    } catch (err: any) {
      return reply.status(err.message?.includes("not found") ? 404 : 400).send({ error: err.message });
    }
  });

  app.patch("/:id/collection-notes/:noteId", async (request, reply) => {
    const { id, noteId } = request.params as { id: string; noteId: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertArRole(role);
    try {
      const note = await updateCustomerCollectionNote(
        id,
        noteId,
        orgId,
        userId,
        request.body as any,
      );
      return reply.send(note);
    } catch (err: any) {
      return reply.status(err.message?.includes("not found") ? 404 : 400).send({ error: err.message });
    }
  });

  app.get("/reports/collections", async (request, reply) => {
    const { orgId } = request.storeContext!;
    return reply.send(await getCustomerCollectionsReport(orgId));
  });

  app.get("/:id/credit-control", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    try {
      return reply.send(await getCustomerCreditControl(id, orgId));
    } catch (err: any) {
      return reply.status(err.message?.includes("not found") ? 404 : 400).send({ error: err.message });
    }
  });

  app.patch("/:id/credit-control", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertAdmin(role);
    try {
      return reply.send(await updateCustomerCreditControl(id, orgId, userId, request.body as any));
    } catch (err: any) {
      return reply.status(err.message?.includes("not found") ? 404 : 400).send({ error: err.message });
    }
  });

  app.get("/:id/disputes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    return reply.send({ data: await listCustomerDisputes(id, orgId) });
  });

  app.post("/:id/disputes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertArRole(role);
    try {
      const data = await createCustomerDispute(id, orgId, userId, request.body as any);
      return reply.status(201).send(data);
    } catch (err: any) {
      return reply.status(err.message?.includes("not found") ? 404 : 400).send({ error: err.message });
    }
  });

  app.patch("/:id/disputes/:disputeId", async (request, reply) => {
    const { id, disputeId } = request.params as { id: string; disputeId: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertArRole(role);
    try {
      const data = await updateCustomerDispute(id, disputeId, orgId, userId, request.body as any);
      return reply.send(data);
    } catch (err: any) {
      return reply.status(err.message?.includes("not found") ? 404 : 400).send({ error: err.message });
    }
  });

  app.post("/:id/merge/preview", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertAdmin(role);
    const body = request.body as { duplicateCustomerId?: string };
    if (!body?.duplicateCustomerId) {
      return reply.status(400).send({ error: "duplicateCustomerId is required" });
    }
    try {
      return reply.send(await getCustomerMergePreview(id, body.duplicateCustomerId, orgId));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/:id/merge/apply", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertAdmin(role);
    const body = request.body as { duplicateCustomerId?: string; reason?: string };
    if (!body?.duplicateCustomerId) {
      return reply.status(400).send({ error: "duplicateCustomerId is required" });
    }
    try {
      return reply.send(await applyCustomerMerge(id, body.duplicateCustomerId, orgId, userId, body.reason || ""));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/:id/timeline", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { limit } = request.query as { limit?: string };
    try {
      const data = await getCustomerTimeline(
        id,
        orgId,
        Math.min(parseInt(limit || "80", 10) || 80, 200),
      );
      return reply.send({ data });
    } catch (err: any) {
      return reply.status(err.message?.includes("not found") ? 404 : 400).send({ error: err.message });
    }
  });

  app.get("/:id/documents", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const data = await listCustomerDocuments(id, orgId);
    return reply.send({ data });
  });
}
