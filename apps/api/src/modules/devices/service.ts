import { createHash, randomInt } from "node:crypto";
import { db } from "@apex/database";
import {
  locations,
  posDeviceRegistrationCodes,
  posDevices,
  users,
} from "@apex/database/schema";
import { eq, and, desc } from "drizzle-orm";

const REGISTRATION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_CODE_TTL_HOURS = 24;

function normalizeRegistrationCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRegistrationCode(orgId: string, code: string) {
  return createHash("sha256")
    .update(`${orgId}:${normalizeRegistrationCode(code)}`)
    .digest("hex");
}

function generateRegistrationCode() {
  const chars = Array.from({ length: 8 }, () =>
    REGISTRATION_CODE_ALPHABET[randomInt(REGISTRATION_CODE_ALPHABET.length)],
  );
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function getDefaultExpiry() {
  return new Date(Date.now() + DEFAULT_CODE_TTL_HOURS * 60 * 60 * 1000);
}

export async function checkDevice(orgId: string, deviceId: string, appVersion?: string) {
  const [device] = await db
    .select({
      id: posDevices.id,
      name: posDevices.name,
      deviceId: posDevices.deviceId,
      locationId: posDevices.locationId,
      locationName: locations.name,
      locationCode: locations.code,
      locationIsActive: locations.isActive,
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

export async function createDeviceRegistrationCode(
  orgId: string,
  userId: string,
  input: { locationId: string; expiresAt?: string },
) {
  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      isActive: locations.isActive,
    })
    .from(locations)
    .where(and(eq(locations.id, input.locationId), eq(locations.orgId, orgId)))
    .limit(1);

  if (!location || !location.isActive) {
    throw new Error("ACTIVE_LOCATION_REQUIRED");
  }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : getDefaultExpiry();
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new Error("FUTURE_EXPIRY_REQUIRED");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRegistrationCode();
    const codeHash = hashRegistrationCode(orgId, code);

    try {
      const [created] = await db
        .insert(posDeviceRegistrationCodes)
        .values({
          orgId,
          locationId: location.id,
          codeHash,
          expiresAt,
          createdByUserId: userId,
        })
        .returning();

      return {
        id: created.id,
        code,
        status: created.status,
        expiresAt: created.expiresAt,
        locationId: location.id,
        locationName: location.name,
        locationCode: location.code,
        qrPayload: JSON.stringify({
          type: "APEX_POS_DEVICE_REGISTRATION",
          code,
          locationId: location.id,
          locationName: location.name,
          locationCode: location.code,
          expiresAt: created.expiresAt?.toISOString(),
        }),
      };
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code !== "23505" || attempt === 4) {
        throw err;
      }
    }
  }

  throw new Error("REGISTRATION_CODE_GENERATION_FAILED");
}

export async function registerDevice(
  orgId: string,
  userId: string,
  input: {
    deviceId: string;
    name: string;
    locationId?: string;
    registrationCode?: string;
    appVersion?: string;
  },
) {
  let locationId = input.locationId;
  let registrationCodeRef: string | null = null;

  if (input.registrationCode) {
    const codeHash = hashRegistrationCode(orgId, input.registrationCode);
    const [registration] = await db
      .select({
        id: posDeviceRegistrationCodes.id,
        status: posDeviceRegistrationCodes.status,
        expiresAt: posDeviceRegistrationCodes.expiresAt,
        locationId: posDeviceRegistrationCodes.locationId,
        locationName: locations.name,
        locationCode: locations.code,
        locationIsActive: locations.isActive,
      })
      .from(posDeviceRegistrationCodes)
      .innerJoin(locations, eq(locations.id, posDeviceRegistrationCodes.locationId))
      .where(
        and(
          eq(posDeviceRegistrationCodes.orgId, orgId),
          eq(posDeviceRegistrationCodes.codeHash, codeHash),
        ),
      )
      .limit(1);

    if (
      !registration ||
      registration.status !== "ACTIVE" ||
      registration.expiresAt <= new Date() ||
      !registration.locationIsActive
    ) {
      if (registration?.status === "ACTIVE" && registration.expiresAt <= new Date()) {
        await db
          .update(posDeviceRegistrationCodes)
          .set({ status: "EXPIRED" })
          .where(eq(posDeviceRegistrationCodes.id, registration.id));
      }
      throw new Error("INVALID_REGISTRATION_CODE");
    }

    locationId = registration.locationId;
    registrationCodeRef = registration.id;
  }

  if (!locationId) {
    throw new Error("LOCATION_REQUIRED");
  }

  if (registrationCodeRef) {
    const [claimed] = await db
      .update(posDeviceRegistrationCodes)
      .set({
        status: "USED",
        usedAt: new Date(),
        usedByDeviceId: input.deviceId,
      })
      .where(
        and(
          eq(posDeviceRegistrationCodes.id, registrationCodeRef),
          eq(posDeviceRegistrationCodes.status, "ACTIVE"),
        ),
      )
      .returning({ id: posDeviceRegistrationCodes.id });

    if (!claimed) {
      throw new Error("INVALID_REGISTRATION_CODE");
    }
  }

  const [device] = await db
    .insert(posDevices)
    .values({
      orgId,
      deviceId: input.deviceId,
      name: input.name,
      locationId,
      appVersion: input.appVersion ?? null,
      registeredByUserId: userId,
    })
    .returning();

  if (registrationCodeRef) {
    await db
      .update(posDeviceRegistrationCodes)
      .set({
        usedByPosDeviceId: device.id,
      })
      .where(eq(posDeviceRegistrationCodes.id, registrationCodeRef));
  }

  // Fetch with location name
  const [full] = await db
    .select({
      id: posDevices.id,
      name: posDevices.name,
      deviceId: posDevices.deviceId,
      locationId: posDevices.locationId,
      locationName: locations.name,
      locationCode: locations.code,
      status: posDevices.status,
      appVersion: posDevices.appVersion,
      registeredAt: posDevices.registeredAt,
    })
    .from(posDevices)
    .innerJoin(locations, eq(locations.id, posDevices.locationId))
    .where(eq(posDevices.id, device.id));

  return { ...full, registrationCodeRef };
}

export async function listDevices(orgId: string) {
  return db
    .select({
      id: posDevices.id,
      name: posDevices.name,
      deviceId: posDevices.deviceId,
      locationId: posDevices.locationId,
      locationName: locations.name,
      locationCode: locations.code,
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
