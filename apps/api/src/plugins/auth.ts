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
};

export const authPlugin = fp(authPluginFn, {
  name: "auth-plugin",
});
