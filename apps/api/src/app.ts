import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { healthRoutes } from "./modules/health/routes";
import { authRoutes } from "./modules/auth/routes";
import { authPlugin } from "./plugins/auth";
import { storeContextPlugin } from "./plugins/store-context";
import { productRoutes } from "./modules/products/routes";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // ── Global plugins ──
  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "dev-secret-change-me",
  });

  // ── Custom plugins ──
  await app.register(authPlugin);
  await app.register(storeContextPlugin);

  // ── Routes ──
  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(productRoutes, { prefix: "/products" });

  return app;
}
