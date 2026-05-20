import type { FastifyInstance } from "fastify";
import { listDevices } from "./device-route-service";
import {
  isDeviceAdmin,
  sendDeviceAdminRequired,
} from "./device-route-helpers";

export async function registerDeviceReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const orgId = request.storeContext?.orgId ?? request.user.orgId;
    const { role } = request.user;

    if (!isDeviceAdmin(role)) {
      return sendDeviceAdminRequired(reply);
    }

    const devices = await listDevices(orgId);
    return reply.send({ data: devices });
  });
}
