import type { FastifyInstance } from "fastify";
import { logAction } from "./auth-audit-service";
import { getUserPermissions } from "./auth-permission-service";
import { authenticateUser } from "./auth-route-service";
import {
  buildAuthTokenPayload,
  buildAuthUserResponse,
  parseLoginRequest,
} from "./auth-route-helpers";

export async function registerAuthLoginRoutes(app: FastifyInstance) {
  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = parseLoginRequest(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      try {
        const user = await authenticateUser(parsed.data.email, parsed.data.password);
        const permissions = await getUserPermissions(user.id, user.role);
        const token = app.jwt.sign(buildAuthTokenPayload(user, permissions), {
          expiresIn: "24h",
        });

        logAction({
          orgId: user.orgId,
          userId: user.id,
          action: "LOGIN",
          details: { email: user.email },
          ipAddress: request.ip,
        });
        return reply.send({
          token,
          user: buildAuthUserResponse(user, permissions),
        });
      } catch {
        return reply.status(401).send({ error: "Invalid email or password" });
      }
    },
  );
}
