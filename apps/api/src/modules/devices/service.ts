import { db } from "@apex/database";
import { posDevices, locations, users } from "@apex/database/schema";
import { eq, and, desc } from "drizzle-orm";

export async function checkDevice(orgId: string, deviceId: string, appVersion?: string) {
  const [device] = await db
    .select({
      id: posDevices.id,
      name: posDevices.name,
      deviceId: posDevices.deviceId,
      locationId: posDevices.locationId,
      locationName: locations.name,
      status: posDevices.status,
      appVersion: posDevices.appVersion,
    })
    .from(posDevices)
    .innerJoin(locations, eq(locations.id, posDevices.locationId))
    .where(and(eq(posDevices.orgId, orgId), eq(posDevices.deviceId, deviceId)))
    .limit(1);

  if (!device) return null;

  // Update lastSeenAt
  await db
    .update(posDevices)
    .set({
      lastSeenAt: new Date(),
      ...(appVersion ? { appVersion } : {}),
    })
    .where(eq(posDevices.id, device.id));

  return device;
}

export async function registerDevice(
  orgId: string,
  userId: string,
  input: { deviceId: string; name: string; locationId: string; appVersion?: string },
) {
  const [device] = await db
    .insert(posDevices)
    .values({
      orgId,
      deviceId: input.deviceId,
      name: input.name,
      locationId: input.locationId,
      appVersion: input.appVersion ?? null,
      registeredByUserId: userId,
    })
    .returning();

  // Fetch with location name
  const [full] = await db
    .select({
      id: posDevices.id,
      name: posDevices.name,
      deviceId: posDevices.deviceId,
      locationId: posDevices.locationId,
      locationName: locations.name,
      status: posDevices.status,
      appVersion: posDevices.appVersion,
      registeredAt: posDevices.registeredAt,
    })
    .from(posDevices)
    .innerJoin(locations, eq(locations.id, posDevices.locationId))
    .where(eq(posDevices.id, device.id));

  return full;
}

export async function listDevices(orgId: string) {
  return db
    .select({
      id: posDevices.id,
      name: posDevices.name,
      deviceId: posDevices.deviceId,
      locationId: posDevices.locationId,
      locationName: locations.name,
      status: posDevices.status,
      lastSeenAt: posDevices.lastSeenAt,
      appVersion: posDevices.appVersion,
      registeredAt: posDevices.registeredAt,
      registeredByName: users.fullName,
    })
    .from(posDevices)
    .innerJoin(locations, eq(locations.id, posDevices.locationId))
    .leftJoin(users, eq(users.id, posDevices.registeredByUserId))
    .where(eq(posDevices.orgId, orgId))
    .orderBy(desc(posDevices.registeredAt));
}

export async function updateDevice(
  id: string,
  orgId: string,
  updates: { name?: string; locationId?: string; status?: string },
) {
  const setObj: Record<string, any> = {};
  if (updates.name) setObj.name = updates.name;
  if (updates.locationId) setObj.locationId = updates.locationId;
  if (updates.status) setObj.status = updates.status;

  const [updated] = await db
    .update(posDevices)
    .set(setObj)
    .where(and(eq(posDevices.id, id), eq(posDevices.orgId, orgId)))
    .returning();

  return updated;
}

export async function deactivateDevice(id: string, orgId: string) {
  return updateDevice(id, orgId, { status: "DEACTIVATED" });
}
