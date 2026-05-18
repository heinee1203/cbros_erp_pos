import type { FastifyInstance } from "fastify";
import { registerDevice } from "./device-route-service";
import {
  DEVICE_REGISTER_ADMIN_REQUIRED_ERROR,
  type RegisterDeviceBody,
  isDeviceAdmin,
  isDuplicateDeviceError,
  sendDeviceAdminRequired,
} from "./device-route-helpers";

export async function registerDeviceRegistrationRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;

    if (!isDeviceAdmin(role)) {
      return sendDeviceAdminRequired(reply, DEVICE_REGISTER_ADMIN_REQUIRED_ERROR);
    }

    const body = request.body as RegisterDeviceBody;

    if (!body.deviceId || !body.name || !body.locationId) {
      return reply.status(400).send({ error: "deviceId, name, and locationId are required" });
    }

    try {
      const device = await registerDevice(orgId, userId, body);
      return reply.status(201).send({ device });
    } catch (err: unknown) {
      if (isDuplicateDeviceError(err)) {
        return reply.status(409).send({ error: "Device already registered" });
      }
      throw err;
    }
  });
}
