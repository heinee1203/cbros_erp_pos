import type { FastifyPluginAsync } from "fastify";
import { registerAuditReadRoutes } from "./audit-read-routes";

const auditRoutes: FastifyPluginAsync = async (app) => {
  await registerAuditReadRoutes(app);
};

export default auditRoutes;
