import type { FastifyInstance } from "fastify";
import {
  deleteNotification,
  markAllRead,
  markRead,
} from "./notification-route-service";
import type { NotificationIdParams } from "./notification-route-helpers";

export async function registerNotificationMutationRoutes(app: FastifyInstance) {
  app.patch("/:id/read", async (request, reply) => {
    const { id } = request.params as NotificationIdParams;
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    await markRead(id, orgId, userId);
    return reply.send({ success: true });
  });

  app.post("/mark-all-read", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    await markAllRead(orgId, userId);
    return reply.send({ success: true });
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as NotificationIdParams;
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    await deleteNotification(id, orgId, userId);
    return reply.send({ success: true });
  });
}
