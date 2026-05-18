import type { FastifyReply } from "fastify";

export type NotificationListQuery = {
  cursor?: string;
  limit?: string;
  type?: string;
  isRead?: string;
};

export type NotificationIdParams = {
  id: string;
};

export type NotificationSettingsBody = {
  dailyDigestEnabled?: boolean;
  dailyDigestTime?: string;
  stockoutEmailEnabled?: boolean;
  stockoutInappEnabled?: boolean;
  lowStockThreshold?: string;
  emailAddress?: string | null;
};

type DailyDigestResult = {
  itemCount: number;
  recipientCount: number;
  critical?: number;
  urgent?: number;
  normal?: number;
};

export function parseNotificationListOptions(query: NotificationListQuery) {
  return {
    cursor: query.cursor,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    type: query.type,
    isRead: query.isRead === "true" ? true : query.isRead === "false" ? false : undefined,
  };
}

export function canTriggerDailyDigest(role: string | undefined) {
  return role === "ADMIN";
}

export function sendDailyDigestAdminRequired(reply: FastifyReply) {
  return reply.status(403).send({ error: "Only admins can trigger the daily digest" });
}

export function buildDailyDigestResponse(result: DailyDigestResult) {
  return {
    success: true,
    message: `Digest sent to ${result.recipientCount} recipients covering ${result.itemCount} items`,
    ...result,
  };
}
