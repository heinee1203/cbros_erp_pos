import type { FastifyPluginAsync } from "fastify";
import { registerCompanySettingsRoutes } from "./company-settings-routes";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  await registerCompanySettingsRoutes(app);
};
