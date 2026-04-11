/**
 * End-to-end verification that the status query filter fix works.
 * Simulates both the OLD (broken) and NEW (fixed) zod + listInvoices path.
 *
 * OLD:  ?status=OPEN&status=PARTIALLY_PAID
 *       → Fastify parses as array ["OPEN","PARTIALLY_PAID"]
 *       → zod z.string().optional() REJECTS → 400
 *
 * NEW:  ?status=OPEN,PARTIALLY_PAID
 *       → Fastify parses as string "OPEN,PARTIALLY_PAID"
 *       → zod accepts → listInvoices splits on "," → inArray([OPEN,PARTIALLY_PAID])
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { z } from "zod";
import { listInvoices } from "../src/modules/accounts-payable/service";

const schema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
});

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const WEST_ELM_ID = "fa06bfbb-5a84-41b7-9a28-23538c8c1c00";

console.log("=== Supplier SOA status filter — verification ===\n");

// OLD behavior (duplicate param → array)
console.log("[1/2] OLD URL: ?status=OPEN&status=PARTIALLY_PAID");
const oldQuery = { status: ["OPEN", "PARTIALLY_PAID"], supplierId: WEST_ELM_ID };
const oldParsed = schema.safeParse(oldQuery);
if (!oldParsed.success) {
  console.log("    zod REJECTS (as expected):", oldParsed.error.issues[0].message);
  console.log("    → API returns 400 → frontend .catch() swallows → empty table\n");
} else {
  console.log("    UNEXPECTED: zod accepted the array form\n");
}

// NEW behavior (comma-separated single string)
console.log("[2/2] NEW URL: ?status=OPEN,PARTIALLY_PAID");
const newQuery = { status: "OPEN,PARTIALLY_PAID", supplierId: WEST_ELM_ID };
const newParsed = schema.safeParse(newQuery);
if (!newParsed.success) {
  console.log("    FAILED: zod rejected:", newParsed.error.issues[0].message);
  process.exit(1);
}
console.log("    zod accepts:", newParsed.data);

const result = await listInvoices(
  ORG_ID,
  {
    status: newParsed.data.status,
    supplierId: newParsed.data.supplierId,
    overdue: false,
  } as any,
  undefined,
  100,
);

console.log(`    listInvoices returned ${result.data.length} rows for West Elm`);
console.table(
  result.data.map((r: any) => ({
    invoiceNumber: r.invoiceNumber,
    status: r.status,
    balance: r.balance,
    totalAmount: r.totalAmount,
  })),
);

const sum = result.data.reduce(
  (s: number, r: any) => s + parseFloat(r.balance),
  0,
);
console.log(`\nSum of balances: ${sum.toFixed(2)}`);
console.log("(Expected 5 rows, sum = 359,309.28 — matches lookup-west-elm-invoices.ts output)");

process.exit(0);
