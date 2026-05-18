import type { FastifyReply } from "fastify";
import { updateCompanySettingsSchema } from "@apex/types";

export function canUpdateCompanySettings(role: unknown) {
  return role === "ADMIN";
}

export function parseCompanySettingsUpdate(body: unknown) {
  return updateCompanySettingsSchema.safeParse(body);
}

export function sendCompanySettingsAdminRequired(reply: FastifyReply) {
  return reply.status(403).send({ error: "Only ADMIN can update company settings" });
}

export function sendInvalidCompanySettingsInput(
  reply: FastifyReply,
  details: unknown,
) {
  return reply.status(400).send({ error: "Invalid input", details });
}
