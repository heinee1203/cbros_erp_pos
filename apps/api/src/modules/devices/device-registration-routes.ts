import type { FastifyInstance } from "fastify";
import {
  createDeviceRegistrationCode,
  registerDevice,
} from "./device-route-service";
import {
  DEVICE_REGISTRATION_CODE_INVALID_ERROR,
  DEVICE_REGISTER_ADMIN_REQUIRED_ERROR,
  type CreateRegistrationCodeBody,
  type RegisterDeviceBody,
  isDeviceAdmin,
  isDuplicateDeviceError,
  sendDeviceAdminRequired,
} from "./device-route-helpers";

export async function registerDeviceRegistrationRoutes(app: FastifyInstance) {
  app.post("/registration-codes", async (request, reply) => {
    const orgId = request.storeContext?.orgId ?? request.user.orgId;
    const { role, userId } = request.user;

    if (!isDeviceAdmin(role)) {
      return sendDeviceAdminRequired(reply, DEVICE_REGISTER_ADMIN_REQUIRED_ERROR);
    }

    const body = request.body as CreateRegistrationCodeBody;
    if (!body.locationId) {
      return reply.status(400).send({ error: "locationId is required" });
    }

    try {
      const registrationCode = await createDeviceRegistrationCode(orgId, userId, body);
      return reply.status(201).send({ registrationCode });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message === "ACTIVE_LOCATION_REQUIRED") {
        return reply.status(400).send({ error: "Active location is required" });
      }
      if (message === "FUTURE_EXPIRY_REQUIRED") {
        return reply.status(400).send({ error: "expiresAt must be in the future" });
      }
      throw err;
    }
  });

  app.post("/register", async (request, reply) => {
    const orgId = request.storeContext?.orgId ?? request.user.orgId;
    const { role, userId } = request.user;

    const body = request.body as RegisterDeviceBody;

    if (!body.deviceId || !body.name || (!body.locationId && !body.registrationCode)) {
      return reply
        .status(400)
        .send({ error: "deviceId, name, and registrationCode or locationId are required" });
    }

    if (body.locationId && !body.registrationCode && !isDeviceAdmin(role)) {
      return sendDeviceAdminRequired(reply, DEVICE_REGISTER_ADMIN_REQUIRED_ERROR);
    }

    try {
      const device = await registerDevice(orgId, userId, body);
      return reply.status(201).send({ device });
    } catch (err: unknown) {
      if (isDuplicateDeviceError(err)) {
        return reply.status(409).send({ error: "Device already registered" });
      }
      const message = err instanceof Error ? err.message : "";
      if (message === "INVALID_REGISTRATION_CODE") {
        return reply.status(400).send({
          code: "INVALID_REGISTRATION_CODE",
          error: DEVICE_REGISTRATION_CODE_INVALID_ERROR,
        });
      }
      if (message === "LOCATION_REQUIRED") {
        return reply.status(400).send({ error: "locationId is required" });
      }
      throw err;
    }
  });
}
