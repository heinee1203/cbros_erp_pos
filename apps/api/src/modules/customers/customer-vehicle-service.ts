import { db } from "@apex/database";
import { customers, customerVehicles } from "@apex/database/schema";
import type { CreateCustomerVehicleInput } from "@apex/types";
import { and, eq } from "drizzle-orm";

export async function listCustomerVehicles(customerId: string, orgId: string) {
  return await db
    .select()
    .from(customerVehicles)
    .where(
      and(
        eq(customerVehicles.customerId, customerId),
        eq(customerVehicles.orgId, orgId),
      ),
    );
}

export async function createCustomerVehicle(
  customerId: string,
  orgId: string,
  input: CreateCustomerVehicleInput,
) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);

  if (!customer) {
    return null;
  }

  const [vehicle] = await db
    .insert(customerVehicles)
    .values({
      orgId,
      customerId,
      make: input.make,
      model: input.model,
      year: input.year ?? null,
      plateNo: input.plateNo ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return vehicle;
}
