import type { FastifyInstance } from "fastify";
import {
  canUpdateCompanySettings,
  parseCompanySettingsUpdate,
  sendCompanySettingsAdminRequired,
  sendInvalidCompanySettingsInput,
} from "./settings-route-helpers";
import {
  getCompanySettings,
  upsertCompanySettings,
} from "./settings-route-service";

export async function registerCompanySettingsRoutes(app: FastifyInstance) {
  app.get("/company", async (request, reply) => {
    const { orgId } = request.storeContext!;

    const settings = await getCompanySettings(orgId);
    return reply.send({ data: settings });
  });

  app.put("/company", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canUpdateCompanySettings(userRole)) {
      return sendCompanySettingsAdminRequired(reply);
    }

    const parsed = parseCompanySettingsUpdate(request.body);
    if (!parsed.success) {
      return sendInvalidCompanySettingsInput(reply, parsed.error.flatten());
    }

    const { orgId } = request.storeContext!;

    const updated = await upsertCompanySettings(orgId, parsed.data);
    return reply.send({ data: updated });
  });
}
