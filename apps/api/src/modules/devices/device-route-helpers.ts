import type { FastifyReply } from "fastify";

export const DEVICE_ADMIN_REQUIRED_ERROR = "Admin required";
export const DEVICE_REGISTER_ADMIN_REQUIRED_ERROR =
  "Admin required to register devices";
export const DEACTIVATED_DEVICE_ERROR =
  "This device has been deactivated. Contact your manager.";

export type DeviceCheckBody = {
  deviceId: string;
  appVersion?: string;
};

export type RegisterDeviceBody = {
  deviceId: string;
  name: string;
  locationId: string;
  appVersion?: string;
};

export type UpdateDeviceBody = {
  name?: string;
  locationId?: string;
  status?: string;
};

export function isDeviceAdmin(role: string | undefined) {
  return role === "ADMIN";
}

export function sendDeviceAdminRequired(
  reply: FastifyReply,
  error = DEVICE_ADMIN_REQUIRED_ERROR,
) {
  return reply.status(403).send({ error });
}

export function isDuplicateDeviceError(err: unknown) {
  const error = err as { code?: string; message?: string };
  return error.code === "23505" || error.message?.includes("duplicate key");
}
