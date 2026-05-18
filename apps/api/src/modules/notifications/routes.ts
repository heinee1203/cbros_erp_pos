import type { FastifyPluginAsync } from "fastify";
import { registerNotificationDigestRoutes } from "./notification-digest-routes";
import { registerNotificationMutationRoutes } from "./notification-mutation-routes";
import { registerNotificationReadRoutes } from "./notification-read-routes";
import { registerNotificationSettingsRoutes } from "./notification-settings-routes";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  await registerNotificationReadRoutes(app);
  await registerNotificationMutationRoutes(app);
  await registerNotificationSettingsRoutes(app);
  await registerNotificationDigestRoutes(app);
};
