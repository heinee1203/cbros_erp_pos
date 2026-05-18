import type { FastifyInstance } from "fastify";
import { getSettings, updateSettings } from "./notification-route-service";
import type { NotificationSettingsBody } from "./notification-route-helpers";

export async function registerNotificationSettingsRoutes(app: FastifyInstance) {
  app.get("/settings", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    const settings = await getSettings(orgId, userId);
    return reply.send(settings);
  });

  app.patch("/settings", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;
    const body = request.body as NotificationSettingsBody;

    const updated = await updateSettings(orgId, userId, body);
    return reply.send(updated);
  });
}
