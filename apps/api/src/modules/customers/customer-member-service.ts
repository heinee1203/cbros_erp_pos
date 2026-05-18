import { db } from "@apex/database";
import { customers } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";

export { getCustomer, softDeleteCustomer, updateCustomer } from "./service";

export async function checkCustomerCredit(
  customerId: string,
  orgId: string,
  chargeAmount: number,
) {
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      currentBalance: customers.currentBalance,
      creditLimit: customers.creditLimit,
      isActive: customers.isActive,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);

  if (!customer) {
    return { status: "not_found" as const };
  }

  if (!customer.isActive) {
    return { status: "inactive" as const };
  }

  const currentBalance = parseFloat(String(customer.currentBalance ?? "0"));
  const creditLimit = parseFloat(String(customer.creditLimit ?? "0"));
  const newBalance = currentBalance + chargeAmount;
  const unlimited = creditLimit <= 0;
  const overage = unlimited ? 0 : Math.max(0, newBalance - creditLimit);
  const requiresOverride = overage > 0;

  return {
    status: "ok" as const,
    data: {
      customerId: customer.id,
      customerName: customer.name,
      canCharge: !requiresOverride,
      requiresOverride,
      unlimited,
      currentBalance: currentBalance.toFixed(2),
      creditLimit: creditLimit.toFixed(2),
      chargeAmount: chargeAmount.toFixed(2),
      newBalance: newBalance.toFixed(2),
      overage: overage.toFixed(2),
    },
  };
}
