import type { FastifyPluginAsync } from "fastify";
import { createVariantSchema, createVariantBatchSchema } from "@apex/types";
import { listVariants, createVariant, createVariantBatch, deleteVariant, convertToRegular } from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const variantRoutes: FastifyPluginAsync = async (app) => {
  // GET /variants/:productId
  app.get<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const variants = await listVariants(request.params.productId, orgId, locationId || undefined);
    return reply.send({ data: variants });
  });

  // POST /variants/:productId — single variant
  app.post<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can create variants" });
    }

    const parsed = createVariantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const result = await createVariant(request.params.productId, orgId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /variants/:productId/batch — batch create
  app.post<{ Params: { productId: string } }>("/:productId/batch", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can create variants" });
    }

    const parsed = createVariantBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const results = await createVariantBatch(request.params.productId, orgId, parsed.data.variants);
      return reply.status(201).send({ data: results, count: results.length });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /variants/:productId/:variantId
  app.delete<{ Params: { productId: string; variantId: string } }>(
    "/:productId/:variantId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can delete variants" });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteVariant(request.params.variantId, orgId);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // POST /variants/:productId/convert-to-regular — remove all variants & convert parent to regular item
  app.post<{ Params: { productId: string } }>(
    "/:productId/convert-to-regular",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can convert products" });
      }

      const { orgId } = request.storeContext!;
      try {
        await convertToRegular(request.params.productId, orgId);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );
};
