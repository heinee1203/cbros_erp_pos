import { db } from "@apex/database";
import { customers } from "@apex/database/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";

export async function searchCustomers(orgId: string, query: string | undefined) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const searchTerm = `%${query.trim()}%`;
  const isOverdue = sql<boolean>`EXISTS (
    SELECT 1 FROM customer_transactions ct_od
    WHERE ct_od.customer_id = ${customers.id}
      AND ct_od.org_id = ${customers.orgId}
      AND ct_od.type = 'CHARGE'
      AND ct_od.recorded_at < NOW() - (${customers.paymentTermsDays} || ' days')::interval
      AND (
        ct_od.amount::numeric - COALESCE(
          (SELECT SUM(a.allocated_amount::numeric)
           FROM ar_payment_allocations a
           WHERE a.charge_transaction_id = ct_od.id), 0
        )
      ) > 0.01
  )`;

  return await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      customerType: customers.customerType,
      creditLimit: customers.creditLimit,
      currentBalance: customers.currentBalance,
      paymentTermsDays: customers.paymentTermsDays,
      isActive: customers.isActive,
      isOverdue,
      vehicleCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM customer_vehicles cv_count
        WHERE cv_count.customer_id = ${customers.id}
          AND cv_count.org_id = ${customers.orgId}
      )`,
      primaryPlateNo: sql<string | null>`(
        SELECT cv_plate.plate_no
        FROM customer_vehicles cv_plate
        WHERE cv_plate.customer_id = ${customers.id}
          AND cv_plate.org_id = ${customers.orgId}
          AND cv_plate.plate_no IS NOT NULL
        ORDER BY cv_plate.updated_at DESC
        LIMIT 1
      )`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.orgId, orgId),
        eq(customers.isActive, true),
        or(
          ilike(customers.name, searchTerm),
          ilike(customers.phone, searchTerm),
          sql`EXISTS (
            SELECT 1
            FROM customer_vehicles cv_search
            WHERE cv_search.customer_id = ${customers.id}
              AND cv_search.org_id = ${orgId}
              AND (
                cv_search.plate_no ILIKE ${searchTerm}
                OR cv_search.make ILIKE ${searchTerm}
                OR cv_search.model ILIKE ${searchTerm}
              )
          )`,
        ),
      ),
    )
    .orderBy(customers.name)
    .limit(20);
}
