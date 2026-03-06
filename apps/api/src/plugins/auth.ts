import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { JwtPayload } from "@apex/types";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

// Paths that do NOT require authentication
const PUBLIC_PATHS = ["/health", "/auth/login", "/auth/register"];

const authPluginFn: FastifyPluginAsync = async (app) => {
  app.decorate(
    "authenticate",
    async function (request: FastifyRequest) {
      try {
        await request.jwtVerify();
      } catch {
        throw app.httpErrors.unauthorized("Invalid or expired token");
      }
    },
  );

  // Global auth hook — runs before store-context for all non-public routes
  app.addHook("onRequest", async (request, reply) => {
    if (PUBLIC_PATHS.some((p) => request.url.startsWith(p))) {
      return;
    }
    await app.authenticate(request);
  });
};

export const authPlugin = fp(authPluginFn, {
  name: "auth-plugin",
});
