import type { FastifyInstance } from "fastify";
import { SUPPLIER_RETURN_ROLES } from "@apex/types";
import { addLineToRTV } from "./supplier-return-line-service";
import { findDraftRTV } from "./supplier-return-read-service";

export async function registerSupplierReturnDraftLineRoutes(app: FastifyInstance) {
  // GET /draft-for-supplier - find existing DRAFT RTV for a supplier
  app.get("/draft-for-supplier", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;
    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply.status(403).send({ error: "Insufficient role" });
    }
    const q = request.query as { supplierId: string };
    if (!q.supplierId) return reply.status(400).send({ error: "supplierId required" });
    if (!locationId) return reply.status(400).send({ error: "A specific location must be selected" });
    const draft = await findDraftRTV(orgId, q.supplierId, locationId);
    return reply.send({ draft });
  });

  // POST /:id/add-line - add a line to an existing DRAFT RTV
  app.post("/:id/add-line", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply.status(403).send({ error: "Insufficient role" });
    }
    const body = request.body as any;
    if (!body.productId || !body.quantity || !body.costPrice || !body.condition) {
      return reply.status(400).send({ error: "productId, quantity, costPrice, and condition are required" });
    }
    try {
      const result = await addLineToRTV(id, orgId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
