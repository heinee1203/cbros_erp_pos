import type { FastifyPluginAsync } from "fastify";
import { registerAuthCredentialRoutes } from "./auth-credential-routes";
import { registerAuthLoginRoutes } from "./auth-login-routes";
import { registerAuthRegistrationRoutes } from "./auth-registration-routes";

export const authRoutes: FastifyPluginAsync = async (app) => {
  await registerAuthRegistrationRoutes(app);
  await registerAuthCredentialRoutes(app);
  await registerAuthLoginRoutes(app);
};
