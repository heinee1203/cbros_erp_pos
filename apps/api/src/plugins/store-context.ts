import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { db } from "@apex/database";
import { locations } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";
import type { StoreContext } from "@apex/types";

const SKIP_PATHS = ["/health", "/auth/login", "/auth/register", "/auth/verify-pin", "/locations"];

declare module "fastify" {
  interface FastifyRequest {
    storeContext: StoreContext | null;
  }
}

const storeContextPluginFn: FastifyPluginAsync = async (app) => {
  app.decorateRequest("storeContext", null as StoreContext | null);

  app.addHook("onRequest", async (request, reply) => {
    if (SKIP_PATHS.some((p) => request.url.startsWith(p))) {
      return;
    }

    // After auth plugin's global hook, request.user is set for non-skip paths.
    // If somehow still null, skip (auth plugin will have already thrown 401).
    if (!request.user) {
      return;
    }

    const locationId = request.headers["x-location-id"] as string | undefined;
    if (!locationId) {
      return reply
        .status(400)
        .send({ error: "X-Location-ID header is required" });
    }

    const [location] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, locationId),
          eq(locations.orgId, request.user.orgId),
        ),
      )
      .limit(1);

    if (!location) {
      return reply
        .status(403)
        .send({ error: "Location not found or access denied" });
    }

    request.storeContext = {
      locationId: location.id,
      orgId: location.orgId,
      locationType: location.type,
    };
  });
};

export const storeContextPlugin = fp(storeContextPluginFn, {
  name: "store-context-plugin",
  dependencies: ["auth-plugin"],
});
