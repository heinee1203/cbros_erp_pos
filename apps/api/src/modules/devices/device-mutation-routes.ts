import type { FastifyInstance } from "fastify";
import { deactivateDevice, updateDevice } from "./device-route-service";
import {
  type UpdateDeviceBody,
  isDeviceAdmin,
  sendDeviceAdminRequired,
} from "./device-route-helpers";

export async function registerDeviceMutationRoutes(app: FastifyInstance) {
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.storeContext?.orgId ?? request.user.orgId;
    const { role } = request.user;

    if (!isDeviceAdmin(role)) {
      return sendDeviceAdminRequired(reply);
    }

    const body = request.body as UpdateDeviceBody;
    const updated = await updateDevice(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Device not found" });
    return reply.send(updated);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.storeContext?.orgId ?? request.user.orgId;
    const { role } = request.user;

    if (!isDeviceAdmin(role)) {
      return sendDeviceAdminRequired(reply);
    }

    await deactivateDevice(id, orgId);
    return reply.send({ success: true });
  });
}
