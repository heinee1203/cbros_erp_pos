import type { FastifyPluginAsync } from "fastify";
import {
  getUnreadCount,
  listNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  getSettings,
  updateSettings,
  generateDailyDigest,
} from "./service";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /notifications ──────────────────────────
  // List notifications for current user with pagination
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    const query = request.query as {
      cursor?: string;
      limit?: string;
      type?: string;
      isRead?: string;
    };

    const result = await listNotifications(orgId, userId, {
      cursor: query.cursor,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      type: query.type,
      isRead: query.isRead === "true" ? true : query.isRead === "false" ? false : undefined,
    });

    return reply.send(result);
  });

  // ─── GET /notifications/unread-count ─────────────
  app.get("/unread-count", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    const count = await getUnreadCount(orgId, userId);
    return reply.send({ count });
  });

  // ─── PATCH /notifications/:id/read ───────────────
  app.patch("/:id/read", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    await markRead(id, orgId, userId);
    return reply.send({ success: true });
  });

  // ─── POST /notifications/mark-all-read ───────────
  app.post("/mark-all-read", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    await markAllRead(orgId, userId);
    return reply.send({ success: true });
  });

  // ─── DELETE /notifications/:id ───────────────────
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    await deleteNotification(id, orgId, userId);
    return reply.send({ success: true });
  });

  // ─── GET /notifications/settings ─────────────────
  app.get("/settings", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    const settings = await getSettings(orgId, userId);
    return reply.send(settings);
  });

  // ─── PATCH /notifications/settings ───────────────
  app.patch("/settings", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;

    const body = request.body as {
      dailyDigestEnabled?: boolean;
      dailyDigestTime?: string;
      stockoutEmailEnabled?: boolean;
      stockoutInappEnabled?: boolean;
      lowStockThreshold?: string;
      emailAddress?: string | null;
    };

    const updated = await updateSettings(orgId, userId, body);
    return reply.send(updated);
  });

  // ─── POST /notifications/daily-digest ────────────
  // Trigger the daily digest (called by external cron or manually)
  app.post("/daily-digest", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Only admins can trigger the daily digest" });
    }

    const result = await generateDailyDigest(orgId);
    return reply.send({
      success: true,
      message: `Digest sent to ${result.recipientCount} recipients covering ${result.itemCount} items`,
      ...result,
    });
  });
};
