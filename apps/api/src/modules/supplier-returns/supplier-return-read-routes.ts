import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseQuery } from "../../lib/validate-query";
import { SUPPLIER_RETURN_ROLES } from "@apex/types";
import {
  getReturnablePoLines,
  getSupplierReturnAnalytics,
  getSupplierReturn,
  listSupplierReturnAttachments,
  listSupplierReturns,
} from "./supplier-return-read-service";
import {
  addSupplierReturnAttachment,
  deleteSupplierReturnAttachment,
} from "./supplier-return-workflow-service";

const supplierReturnsQuerySchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});

const poReturnableLinesQuerySchema = z.object({
  poId: z.string().uuid(),
  excludeRtvId: z.string().uuid().optional(),
});

const analyticsQuerySchema = z.object({
  allLocations: z.enum(["true", "false"]).optional(),
});

const supplierReturnAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.coerce.number().int().min(0).max(10_000_000).default(0),
  attachmentType: z
    .enum(["PRODUCT_PHOTO", "DEFECT_PHOTO", "SIGNED_RETURN_FORM", "CREDIT_MEMO", "OTHER"])
    .default("OTHER"),
  dataUrl: z.string().min(1),
});

export async function registerSupplierReturnReadRoutes(app: FastifyInstance) {
  // GET / - list supplier returns with filters and cursor pagination
  app.get("/", async (request, reply) => {
    const q = parseQuery(supplierReturnsQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !["ADMIN", "MANAGER"].includes(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listSupplierReturns(orgId, {
      locationId: allLocations ? undefined : locationId,
      status: q.status?.split(",").filter(Boolean),
      supplierId: q.supplierId,
      search: q.search,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // GET /po-returnable-lines - received PO lines with remaining returnable qty
  app.get("/po-returnable-lines", async (request, reply) => {
    const q = parseQuery(poReturnableLinesQuerySchema, request.query, reply);
    if (!q) return;
    const { orgId } = request.storeContext!;

    const result = await getReturnablePoLines(orgId, q.poId, q.excludeRtvId);
    return reply.send(result);
  });

  // GET /analytics - RTV aging and return analytics dashboard
  app.get("/analytics", async (request, reply) => {
    const q = parseQuery(analyticsQuerySchema, request.query, reply);
    if (!q) return;
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !["ADMIN", "MANAGER"].includes(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await getSupplierReturnAnalytics(orgId, {
      locationId: allLocations ? undefined : locationId,
    });
    return reply.send(result);
  });

  // GET /:id - supplier return detail with lines and status history
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getSupplierReturn(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Supplier return not found" });
    }
    return reply.send(result);
  });

  // GET /:id/attachments - proof photos/forms/credit memo files
  app.get("/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await listSupplierReturnAttachments(id, orgId);
    return reply.send(result);
  });

  // POST /:id/attachments - add proof attachment
  app.post("/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can attach supplier return proof" });
    }

    const parsed = supplierReturnAttachmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await addSupplierReturnAttachment(id, orgId, userId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /:id/attachments/:attachmentId - remove proof attachment
  app.delete("/:id/attachments/:attachmentId", async (request, reply) => {
    const { id, attachmentId } = request.params as { id: string; attachmentId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can delete supplier return proof" });
    }

    try {
      await deleteSupplierReturnAttachment(id, attachmentId, orgId, userId);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
