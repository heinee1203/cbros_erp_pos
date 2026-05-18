import type { FastifyPluginAsync } from "fastify";
import { registerTechnicianCommissionRoutes } from "./technician-commission-routes";
import { registerTechnicianReadRoutes } from "./technician-read-routes";
import { registerTechnicianWriteRoutes } from "./technician-write-routes";

export const technicianRoutes: FastifyPluginAsync = async (app) => {
  await registerTechnicianReadRoutes(app);
  await registerTechnicianWriteRoutes(app);
  await registerTechnicianCommissionRoutes(app);
};
