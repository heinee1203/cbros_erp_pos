import type { FastifyInstance } from "fastify";
import {
  addProductSupplier,
  deleteProductSupplier,
  reorderPriorities,
  updateProductSupplier,
} from "./product-supplier-route-service";
import {
  canManageProductSuppliers,
  hasOrderedProductSupplierIds,
  isProductSupplierMappingNotFoundError,
  type ProductSupplierCreateBody,
  type ProductSupplierReorderBody,
  type ProductSupplierUpdateBody,
} from "./product-supplier-route-helpers";

export async function registerProductSupplierMutationRoutes(
  app: FastifyInstance,
) {
  app.post("/:productId/suppliers", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!canManageProductSuppliers(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as ProductSupplierCreateBody;

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

  app.patch("/:productId/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!canManageProductSuppliers(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as ProductSupplierUpdateBody;

    try {
      const result = await updateProductSupplier(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (isProductSupplierMappingNotFoundError(err)) {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete("/:productId/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!canManageProductSuppliers(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    try {
      await deleteProductSupplier(orgId, id);
      return reply.send({ success: true });
    } catch (err: any) {
      if (isProductSupplierMappingNotFoundError(err)) {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/:productId/suppliers/reorder", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!canManageProductSuppliers(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as ProductSupplierReorderBody;

    if (!hasOrderedProductSupplierIds(body)) {
      return reply.status(400).send({ error: "orderedIds array is required" });
    }

    try {
      const result = await reorderPriorities(orgId, productId, body.orderedIds);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
