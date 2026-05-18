import { db } from "@apex/database";
import { locations } from "@apex/database/schema";
import type { CreateLocationInput, UpdateLocationInput } from "@apex/types";
import { and, eq } from "drizzle-orm";

function buildLocationByOrgWhere(id: string, orgId: string) {
  return and(eq(locations.id, id), eq(locations.orgId, orgId));
}

function buildLocationCodeWhere(orgId: string, code: string) {
  return and(eq(locations.orgId, orgId), eq(locations.code, code));
}

function buildLocationListWhere(orgId: string, includeInactive: boolean) {
  const conditions = [eq(locations.orgId, orgId)];
  if (!includeInactive) {
    conditions.push(eq(locations.isActive, true));
  }

  return and(...conditions);
}

export async function listLocationsForOrg(
  orgId: string,
  includeInactive: boolean,
) {
  return db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      type: locations.type,
      address: locations.address,
      isActive: locations.isActive,
      isSystem: locations.isSystem,
      createdAt: locations.createdAt,
      updatedAt: locations.updatedAt,
    })
    .from(locations)
    .where(buildLocationListWhere(orgId, includeInactive))
    .orderBy(locations.name);
}

export async function findLocationByCode(orgId: string, code: string) {
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(buildLocationCodeWhere(orgId, code))
    .limit(1);

  return location ?? null;
}

export async function findMutableLocation(id: string, orgId: string) {
  const [location] = await db
    .select({
      id: locations.id,
      isActive: locations.isActive,
      isSystem: locations.isSystem,
    })
    .from(locations)
    .where(buildLocationByOrgWhere(id, orgId))
    .limit(1);

  return location ?? null;
}

export async function createLocationForOrg(
  orgId: string,
  data: CreateLocationInput,
) {
  const [created] = await db
    .insert(locations)
    .values({
      orgId,
      name: data.name,
      code: data.code,
      type: data.type,
      address: data.address ?? null,
    })
    .returning();

  return created;
}

export async function updateLocationForOrg(
  id: string,
  orgId: string,
  data: UpdateLocationInput,
) {
  const [updated] = await db
    .update(locations)
    .set(data)
    .where(buildLocationByOrgWhere(id, orgId))
    .returning();

  return updated;
}

export async function deactivateLocationForOrg(id: string, orgId: string) {
  const [deactivated] = await db
    .update(locations)
    .set({ isActive: false })
    .where(buildLocationByOrgWhere(id, orgId))
    .returning();

  return deactivated;
}

export async function reactivateLocationForOrg(id: string, orgId: string) {
  const [reactivated] = await db
    .update(locations)
    .set({ isActive: true })
    .where(buildLocationByOrgWhere(id, orgId))
    .returning();

  return reactivated;
}
