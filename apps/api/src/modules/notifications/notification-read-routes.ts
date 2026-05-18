import type { FastifyInstance } from "fastify";
import { getUnreadCount, listNotifications } from "./notification-route-service";
import {
  parseNotificationListOptions,
  type NotificationListQuery,
} from "./notification-route-helpers";

export async function registerNotificationReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;
    const query = request.query as NotificationListQuery;

    const result = await listNotifications(
      orgId,
      userId,
      parseNotificationListOptions(query),
    );

    return reply.send(result);
  });

  app.get("/unread-count", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    const count = await getUnreadCount(orgId, userId);
    return reply.send({ count });
  });
}
