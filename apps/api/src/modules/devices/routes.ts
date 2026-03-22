import type { FastifyPluginAsync } from "fastify";
import {
  checkDevice,
  registerDevice,
  listDevices,
  updateDevice,
  deactivateDevice,
} from "./service";

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  // POST /devices/check — called on every app launch after login
  app.post("/check", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { deviceId, appVersion } = request.body as { deviceId: string; appVersion?: string };

    if (!deviceId) {
      return reply.status(400).send({ error: "deviceId is required" });
    }

    const device = await checkDevice(orgId, deviceId, appVersion);

    if (!device) {
      return reply.send({ registered: false });
    }

    if (device.status === "DEACTIVATED") {
      return reply.status(403).send({
        error: "This device has been deactivated. Contact your manager.",
      });
    }

    return reply.send({
      registered: true,
      device: {
        id: device.id,
        name: device.name,
        locationId: device.locationId,
        locationName: device.locationName,
      },
    });
  });

  // POST /devices/register — ADMIN only, first-time device setup
  app.post("/register", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;

    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required to register devices" });
    }

    const body = request.body as {
      deviceId: string;
      name: string;
      locationId: string;
      appVersion?: string;
    };

    if (!body.deviceId || !body.name || !body.locationId) {
      return reply.status(400).send({ error: "deviceId, name, and locationId are required" });
    }

    try {
      const device = await registerDevice(orgId, userId, body);
      return reply.status(201).send({ device });
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("duplicate key")) {
        return reply.status(409).send({ error: "Device already registered" });
      }
      throw err;
    }
  });

  // GET /devices — list all devices (web admin)
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }

    const devices = await listDevices(orgId);
    return reply.send({ data: devices });
  });

  // PATCH /devices/:id — update device
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }

    const body = request.body as { name?: string; locationId?: string; status?: string };
    const updated = await updateDevice(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Device not found" });
    return reply.send(updated);
  });

  // DELETE /devices/:id — deactivate device
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }

    await deactivateDevice(id, orgId);
    return reply.send({ success: true });
  });
};
