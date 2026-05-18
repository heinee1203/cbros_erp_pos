import type { FastifyPluginAsync } from "fastify";
import { registerRbacRoleRoutes } from "./rbac-role-routes";
import { registerRbacSeedRoutes } from "./rbac-seed-routes";
import { registerRbacUserRoutes } from "./rbac-user-routes";

export const rbacRoutes: FastifyPluginAsync = async (app) => {
  await registerRbacRoleRoutes(app);
  await registerRbacUserRoutes(app);
  await registerRbacSeedRoutes(app);
};
