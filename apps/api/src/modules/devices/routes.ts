import type { FastifyPluginAsync } from "fastify";
import { registerDeviceCheckRoutes } from "./device-check-routes";
import { registerDeviceMutationRoutes } from "./device-mutation-routes";
import { registerDeviceReadRoutes } from "./device-read-routes";
import { registerDeviceRegistrationRoutes } from "./device-registration-routes";

export const deviceRoutes: FastifyPluginAsync = async (app) => {
  await registerDeviceCheckRoutes(app);
  await registerDeviceRegistrationRoutes(app);
  await registerDeviceReadRoutes(app);
  await registerDeviceMutationRoutes(app);
};
