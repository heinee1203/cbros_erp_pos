import type { FastifyInstance } from "fastify";
import {
  bulkRegisterSerials,
  findSerialRegistrationLocation,
  findSerialRegistrationProduct,
} from "./serial-route-service";
import {
  getBulkRegisterSerialInput,
  hasValidBulkRegisterSerialInput,
  isSerialAdminRole,
  type BulkRegisterSerialBody,
} from "./serial-route-helpers";

export async function registerSerialWriteRoutes(app: FastifyInstance) {
  app.post("/bulk-register", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!isSerialAdminRole(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role for serial registration" });
    }

    const body = request.body as BulkRegisterSerialBody;
    const serialInput = getBulkRegisterSerialInput(body);
    if (!hasValidBulkRegisterSerialInput(body, serialInput)) {
      return reply.status(400).send({
        error:
          "productId, locationId, and a non-empty serialNumbers/serials array are required",
      });
    }

    const product = await findSerialRegistrationProduct(orgId, body.productId!);
    if (!product) {
      return reply.status(404).send({ error: "Product not found" });
    }
    if (!product.isSerialized) {
      return reply
        .status(400)
        .send({ error: "Product is not configured for serial tracking" });
    }

    const location = await findSerialRegistrationLocation(
      orgId,
      body.locationId!,
    );
    if (!location) {
      return reply.status(404).send({ error: "Location not found" });
    }

    const result = await bulkRegisterSerials(
      orgId,
      body.productId!,
      body.locationId!,
      serialInput!,
    );
    return reply.status(201).send(result);
  });
}
