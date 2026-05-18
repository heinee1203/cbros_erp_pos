import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseQuery } from "../../lib/validate-query";
import {
  getSupplierReturn,
  listSupplierReturns,
} from "./supplier-return-read-service";

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
}
