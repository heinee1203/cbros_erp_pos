import type { FastifyInstance } from "fastify";
import { createOrganizationWithAdmin } from "./auth-route-service";
import { getUserPermissions } from "./auth-permission-service";
import {
  buildAuthTokenPayload,
  buildAuthUserResponse,
  buildOrganizationResponse,
  isDuplicateEmailError,
  isPublicRegistrationEnabled,
  parseRegisterRequest,
} from "./auth-route-helpers";

export async function registerAuthRegistrationRoutes(app: FastifyInstance) {
  app.post(
    "/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!isPublicRegistrationEnabled()) {
        return reply.status(404).send({ error: "Registration is not available" });
      }

      const parsed = parseRegisterRequest(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      try {
        const { org, user } = await createOrganizationWithAdmin(parsed.data);
        const permissions = await getUserPermissions(user.id, user.role);
        const token = app.jwt.sign(buildAuthTokenPayload(user, permissions), {
          expiresIn: "24h",
        });

        return reply.status(201).send({
          token,
          user: buildAuthUserResponse(user, permissions),
          organization: buildOrganizationResponse(org),
        });
      } catch (err: unknown) {
        if (isDuplicateEmailError(err)) {
          return reply.status(409).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}
