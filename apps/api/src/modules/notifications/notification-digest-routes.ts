import type { FastifyInstance } from "fastify";
import { generateDailyDigest } from "./notification-route-service";
import {
  buildDailyDigestResponse,
  canTriggerDailyDigest,
  sendDailyDigestAdminRequired,
} from "./notification-route-helpers";

export async function registerNotificationDigestRoutes(app: FastifyInstance) {
  app.post("/daily-digest", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!canTriggerDailyDigest(role)) {
      return sendDailyDigestAdminRequired(reply);
    }

    const result = await generateDailyDigest(orgId);
    return reply.send(buildDailyDigestResponse(result));
  });
}
