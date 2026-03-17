import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { db } from "@apex/database";
import { locations } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";
import type { StoreContext } from "@apex/types";

const SKIP_PATHS = ["/health", "/auth/login", "/auth/register", "/auth/verify-pin", "/locations"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // No header or invalid format → org-only context (no specific location)
    if (!locationId || !UUID_RE.test(locationId)) {
      request.storeContext = {
        locationId: null,
        orgId: request.user.orgId,
        locationType: null,
      };
      return;
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
