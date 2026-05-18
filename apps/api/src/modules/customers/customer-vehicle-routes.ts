import type { FastifyInstance } from "fastify";
import { createCustomerVehicleSchema } from "@apex/types";
import {
  createCustomerVehicle,
  listCustomerVehicles,
} from "./customer-vehicle-service";
import { assertArRole } from "./route-support";

export function registerCustomerVehicleRoutes(app: FastifyInstance) {
  app.get("/:id/vehicles", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const vehicles = await listCustomerVehicles(id, orgId);

    return reply.send({ data: vehicles });
  });

  app.post("/:id/vehicles", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);

    const parsed = createCustomerVehicleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const vehicle = await createCustomerVehicle(id, orgId, parsed.data);
      if (!vehicle) {
        return reply.status(404).send({ error: "Customer not found" });
      }

      return reply.status(201).send(vehicle);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
