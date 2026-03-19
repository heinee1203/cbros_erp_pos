import type { FastifyPluginAsync } from "fastify";
import {
  listProductSuppliers,
  addProductSupplier,
  updateProductSupplier,
  deleteProductSupplier,
  reorderPriorities,
  backfillProductSuppliers,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const productSuppliersRoutes: FastifyPluginAsync = async (app) => {
  // ─── POST /products/backfill-suppliers ──────────────
  // One-time backfill from PO history
  app.post("/backfill-suppliers", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN") return reply.status(403).send({ error: "Admin only" });

    const { orgId } = request.storeContext!;
    const count = await backfillProductSuppliers(orgId);
    return reply.send({ success: true, created: count });
  });

  // ─── GET /products/:productId/suppliers ──────────────
  // List all suppliers for a product, ordered by priority
  app.get("/:productId/suppliers", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;

    const data = await listProductSuppliers(orgId, productId);
    return reply.send({ data });
  });

  // ─── POST /products/:productId/suppliers ──────────────
  // Add a supplier mapping to a product
  app.post("/:productId/suppliers", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as {
      supplierId: string;
      priority?: number;
      supplierSku?: string;
      supplierCost?: string;
      minOrderQty?: number;
      leadTimeDays?: number;
      notes?: string;
    };

    if (!body.supplierId) {
      return reply.status(400).send({ error: "supplierId is required" });
    }

    try {
      const result = await addProductSupplier(orgId, productId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /products/:productId/suppliers/:id ──────────
  // Update a product-supplier mapping
  app.patch("/:productId/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as {
      priority?: number;
      supplierSku?: string | null;
      supplierCost?: string | null;
      minOrderQty?: number;
      leadTimeDays?: number | null;
      isActive?: boolean;
      notes?: string | null;
    };

    try {
      const result = await updateProductSupplier(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Product-supplier mapping not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /products/:productId/suppliers/:id ──────────
  // Remove a product-supplier mapping
  app.delete("/:productId/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    try {
      await deleteProductSupplier(orgId, id);
      return reply.send({ success: true });
    } catch (err: any) {
      if (err.message === "Product-supplier mapping not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /products/:productId/suppliers/reorder ──────────
  // Reorder supplier priorities for a product
  app.post("/:productId/suppliers/reorder", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as { orderedIds: string[] };

    if (!body.orderedIds || !Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
      return reply.status(400).send({ error: "orderedIds array is required" });
    }

    try {
      const result = await reorderPriorities(orgId, productId, body.orderedIds);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
