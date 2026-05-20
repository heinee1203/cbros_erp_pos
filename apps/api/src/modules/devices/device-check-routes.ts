import type { FastifyInstance } from "fastify";
import { checkDevice } from "./device-route-service";
import {
  DEACTIVATED_DEVICE_ERROR,
  type DeviceCheckBody,
} from "./device-route-helpers";

export async function registerDeviceCheckRoutes(app: FastifyInstance) {
  app.post("/check", async (request, reply) => {
    const orgId = request.storeContext?.orgId ?? request.user.orgId;
    const { deviceId, appVersion } = request.body as DeviceCheckBody;

    if (!deviceId) {
      return reply.status(400).send({ error: "deviceId is required" });
    }

    const device = await checkDevice(orgId, deviceId, appVersion);

    if (!device) {
      return reply.send({ registered: false });
    }

    if (device.status === "DEACTIVATED") {
      return reply.status(403).send({
        code: "DEVICE_DEACTIVATED",
        error: DEACTIVATED_DEVICE_ERROR,
        device: {
          id: device.id,
          name: device.name,
          locationId: device.locationId,
          locationName: device.locationName,
          locationCode: device.locationCode,
          status: device.status,
        },
      });
    }

    if (!device.locationIsActive) {
      return reply.status(403).send({
        code: "DEVICE_LOCATION_INACTIVE",
        error: "This device is locked to an inactive store. Contact support.",
        device: {
          id: device.id,
          name: device.name,
          locationId: device.locationId,
          locationName: device.locationName,
          locationCode: device.locationCode,
          status: device.status,
        },
      });
    }

    return reply.send({
      registered: true,
      device: {
        id: device.id,
        name: device.name,
        locationId: device.locationId,
        locationName: device.locationName,
        locationCode: device.locationCode,
        status: device.status,
      },
    });
  });
}
