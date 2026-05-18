import type { FastifyInstance } from "fastify";
import {
  setAuthorizationPin,
  verifyAuthorizationCredential,
  verifyPin,
} from "./auth-route-service";
import {
  isValidPin,
  normalizeAuthorizationCredential,
} from "./auth-route-helpers";

export async function registerAuthCredentialRoutes(app: FastifyInstance) {
  app.post(
    "/verify-pin",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { pin } = request.body as { pin?: string };
      if (!isValidPin(pin)) {
        return reply.status(400).send({ error: "PIN must be exactly 4 digits" });
      }

      const result = await verifyPin(request.user.orgId, pin);
      return reply.send(result);
    },
  );

  app.post(
    "/verify-authorization",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { credential, method } = request.body as {
        credential?: string;
        method?: string;
      };
      const trimmed = normalizeAuthorizationCredential(credential);
      if (!trimmed) {
        return reply.status(400).send({ error: "Authorization credential is required" });
      }

      const result = await verifyAuthorizationCredential(request.user.orgId, trimmed);
      return reply.send({ ...result, method: method ?? "credential" });
    },
  );

  app.post(
    "/authorization-pin",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { pin } = request.body as { pin?: string };
      if (!isValidPin(pin)) {
        return reply.status(400).send({ error: "PIN must be exactly 4 digits" });
      }

      const result = await setAuthorizationPin({
        orgId: request.user.orgId,
        userId: request.user.userId,
        pin,
      });

      if (!result.success) {
        return reply.status(403).send({ error: "Only managers and admins can set authorization PINs" });
      }

      return reply.send(result);
    },
  );
}
