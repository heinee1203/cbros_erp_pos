import { db } from "@apex/database";
import {
  vehicles,
  vehicleCompatibility,
  products,
} from "@apex/database/schema";
import { eq, and, sql, ilike, desc, asc, type SQL } from "drizzle-orm";

// ══════════════════════════════════════════════════════
// VEHICLES CRUD
// ══════════════════════════════════════════════════════

export async function listVehicles(
  orgId: string,
  opts: { search?: string; make?: string; limit?: number; cursor?: string } = {},
) {
  const limit = opts.limit ?? 50;
  const conditions: SQL[] = [eq(vehicles.orgId, orgId)];

  if (opts.make) conditions.push(eq(vehicles.make, opts.make));
  if (opts.search) {
    conditions.push(
      sql`(${vehicles.make} ILIKE ${"%" + opts.search + "%"} OR ${vehicles.model} ILIKE ${"%" + opts.search + "%"})`,
    );
  }
  if (opts.cursor) conditions.push(sql`${vehicles.id} < ${opts.cursor}`);

  const rows = await db
    .select()
    .from(vehicles)
    .where(and(...conditions))
    .orderBy(asc(vehicles.make), asc(vehicles.model), desc(vehicles.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function createVehicle(
  orgId: string,
  input: {
    make: string;
    model: string;
    yearFrom?: number | null;
    yearTo?: number | null;
    engine?: string | null;
    variant?: string | null;
    bodyType?: string | null;
    notes?: string | null;
  },
) {
  const [vehicle] = await db
    .insert(vehicles)
    .values({
      orgId,
      make: input.make.trim(),
      model: input.model.trim(),
      yearFrom: input.yearFrom ?? null,
      yearTo: input.yearTo ?? null,
      engine: input.engine?.trim() || null,
      variant: input.variant?.trim() || null,
      bodyType: input.bodyType?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .onConflictDoNothing()
    .returning();

  if (vehicle) return vehicle;

  // Already exists — fetch and return it
  const [existing] = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.orgId, orgId),
        eq(vehicles.make, input.make.trim()),
        eq(vehicles.model, input.model.trim()),
        input.yearFrom != null ? eq(vehicles.yearFrom, input.yearFrom) : sql`${vehicles.yearFrom} IS NULL`,
        input.yearTo != null ? eq(vehicles.yearTo, input.yearTo) : sql`${vehicles.yearTo} IS NULL`,
        input.engine ? eq(vehicles.engine, input.engine.trim()) : sql`${vehicles.engine} IS NULL`,
        input.variant ? eq(vehicles.variant, input.variant.trim()) : sql`${vehicles.variant} IS NULL`,
      ),
    )
    .limit(1);

  return existing;
}

export async function updateVehicle(
  id: string,
  orgId: string,
  updates: Record<string, any>,
) {
  const [updated] = await db
    .update(vehicles)
    .set(updates)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
    .returning();
  return updated;
}

export async function deleteVehicle(id: string, orgId: string, force = false) {
  if (force) {
    // Remove all fitment records first
    await db
      .delete(vehicleCompatibility)
      .where(eq(vehicleCompatibility.vehicleId, id));
  } else {
    // Check if any fitments reference this vehicle
    const [ref] = await db
      .select({ id: vehicleCompatibility.id })
      .from(vehicleCompatibility)
      .where(eq(vehicleCompatibility.vehicleId, id))
      .limit(1);

    if (ref) {
      throw new Error("Cannot delete vehicle — it has fitment records. Use force=true to remove all fitments and delete.");
    }
  }

  await db
    .delete(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)));
}

export async function unfitAllProducts(vehicleId: string, orgId: string) {
  const result = await db
    .delete(vehicleCompatibility)
    .where(eq(vehicleCompatibility.vehicleId, vehicleId));
  return { removed: true };
}

// ══════════════════════════════════════════════════════
// VEHICLE PRODUCTS
// ══════════════════════════════════════════════════════

export async function getVehicleProducts(vehicleId: string, orgId: string) {
  // Find products fitted to THIS specific vehicle (by vehicle_id FK)
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      compatId: vehicleCompatibility.id,
    })
    .from(vehicleCompatibility)
    .innerJoin(products, eq(products.id, vehicleCompatibility.productId))
    .where(eq(vehicleCompatibility.vehicleId, vehicleId))
    .orderBy(asc(products.name));

  return rows;
}

// ══════════════════════════════════════════════════════
// BULK FITMENT
// ══════════════════════════════════════════════════════

export async function bulkApplyFitment(
  orgId: string,
  vehicleId: string,
  productIds: string[],
  notes?: string,
) {
  // Get the vehicle
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.orgId, orgId)))
    .limit(1);

  if (!vehicle) throw new Error("Vehicle not found");

  let created = 0;
  let skipped = 0;

  for (const productId of productIds) {
    // Check if fitment already exists for this specific vehicle
    const [existing] = await db
      .select({ id: vehicleCompatibility.id })
      .from(vehicleCompatibility)
      .where(
        and(
          eq(vehicleCompatibility.productId, productId),
          eq(vehicleCompatibility.vehicleId, vehicle.id),
        ),
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(vehicleCompatibility).values({
      productId,
      vehicleId: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      yearStart: vehicle.yearFrom,
      yearEnd: vehicle.yearTo,
      engine: vehicle.engine,
      notes: notes || vehicle.notes || null,
    });
    created++;
  }

  return { created, skipped, total: productIds.length };
}

export async function bulkRemoveFitment(
  orgId: string,
  vehicleId: string,
  productIds: string[],
) {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.orgId, orgId)))
    .limit(1);

  if (!vehicle) throw new Error("Vehicle not found");

  let removed = 0;
  for (const productId of productIds) {
    await db
      .delete(vehicleCompatibility)
      .where(
        and(
          eq(vehicleCompatibility.productId, productId),
          eq(vehicleCompatibility.vehicleId, vehicle.id),
        ),
      );
    removed++;
  }

  return { removed, total: productIds.length };
}
