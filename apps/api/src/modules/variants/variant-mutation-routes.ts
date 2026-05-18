import type { FastifyInstance } from "fastify";
import { createVariantBatchSchema, createVariantSchema } from "@apex/types";
import {
  canManageVariants,
  sendVariantManageRequired,
  type VariantDeleteParams,
  type VariantProductParams,
} from "./variant-route-helpers";
import { convertToRegular, createVariant, createVariantBatch, deleteVariant } from "./variant-route-service";

export async function registerVariantMutationRoutes(app: FastifyInstance) {
  app.post<{ Params: VariantProductParams }>("/:productId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canManageVariants(userRole)) {
      return sendVariantManageRequired(reply, "create variants");
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

  app.post<{ Params: VariantProductParams }>("/:productId/batch", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canManageVariants(userRole)) {
      return sendVariantManageRequired(reply, "create variants");
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

  app.delete<{ Params: VariantDeleteParams }>("/:productId/:variantId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canManageVariants(userRole)) {
      return sendVariantManageRequired(reply, "delete variants");
    }

    const { orgId } = request.storeContext!;
    try {
      await deleteVariant(request.params.variantId, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post<{ Params: VariantProductParams }>("/:productId/convert-to-regular", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canManageVariants(userRole)) {
      return sendVariantManageRequired(reply, "convert products");
    }

    const { orgId } = request.storeContext!;
    try {
      await convertToRegular(request.params.productId, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
