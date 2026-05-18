import type { FastifyInstance } from "fastify";
import {
  getSerialsBySale,
  listSerials,
  lookupSerial,
  validateSerialNumber,
} from "./serial-route-service";
import {
  parseSerialListLimit,
  type SerialRouteQuery,
} from "./serial-route-helpers";

export async function registerSerialReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as SerialRouteQuery;

    const limit = parseSerialListLimit(q);
    const cursor = q.cursor;

    const result = await listSerials({
      orgId,
      productId: q.productId,
      status: q.status,
      locationId: q.locationId,
      search: q.search,
      cursor,
      limit,
    });

    return reply.send(result);
  });

  app.get("/lookup/:serialNumber", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { serialNumber } = request.params as { serialNumber: string };

    const serial = await lookupSerial(orgId, serialNumber);
    if (!serial) {
      return reply.status(404).send({ error: "Serial number not found" });
    }

    return reply.send(serial);
  });

  app.get("/validate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { serialNumber?: string; productId?: string };

    if (!q.serialNumber) {
      return reply.status(400).send({ error: "serialNumber is required" });
    }

    return reply.send(
      await validateSerialNumber(orgId, q.serialNumber, q.productId),
    );
  });

  app.get("/by-sale/:saleId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { saleId } = request.params as { saleId: string };

    const data = await getSerialsBySale(orgId, saleId);
    return reply.send({ data });
  });
}
