import assert from "node:assert/strict";
import test from "node:test";

test("customer safety summary scores missing profile fields and credit limit risk", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { buildCustomerSafetySummary, buildDuplicateIndex } = await import(
    "./customer-safety-service"
  );

  const rows = [
    {
      id: "1",
      name: "Adayo, Jaime",
      phone: "AR-0012",
      customerType: "INDIVIDUAL",
      address: null,
      tin: null,
      creditLimit: "0.00",
      currentBalance: "11320.98",
      isActive: true,
    },
  ];
  const summary = buildCustomerSafetySummary(rows[0], buildDuplicateIndex(rows));

  assert.equal(summary.creditLimitStatus, "missing");
  assert.ok(summary.missingFields.includes("address"));
  assert.ok(summary.missingFields.includes("TIN"));
  assert.ok(summary.missingFields.includes("credit limit"));
  assert.ok(summary.completenessScore < 100);
});

test("customer safety summary flags duplicate TIN, phone, and similar names", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { buildCustomerSafetySummary, buildDuplicateIndex } = await import(
    "./customer-safety-service"
  );

  const rows = [
    { id: "1", name: "AET Ads", phone: "AR-0001", tin: "123", customerType: "SHOP" },
    { id: "2", name: "AET ADS", phone: "AR-0001", tin: "123", customerType: "SHOP" },
  ];
  const summary = buildCustomerSafetySummary(rows[0], buildDuplicateIndex(rows));

  assert.deepEqual(
    summary.duplicateWarnings.map((warning) => warning.field).sort(),
    ["TIN", "name", "phone"],
  );
  assert.equal(summary.duplicateWarnings.filter((warning) => warning.severity === "critical").length, 2);
});

test("customer credit control summary distinguishes watchlist and billing block", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { buildCustomerCreditControl } = await import("./customer-safety-service");

  const watchlist = buildCustomerCreditControl({
    id: "1",
    name: "Watch Customer",
    creditLimit: "10000.00",
    currentBalance: "2500.00",
    creditStatus: "WATCHLIST",
    creditHoldType: "WATCHLIST",
    creditHoldReason: "Slow payer",
  });
  assert.equal(watchlist.blocksBilling, false);
  assert.equal(watchlist.availableCredit, 7500);

  const blocked = buildCustomerCreditControl({
    id: "2",
    name: "Blocked Customer",
    creditLimit: "5000.00",
    currentBalance: "6000.00",
    creditStatus: "BLOCKED",
    creditHoldType: "BLOCK_BILLING",
    creditHoldReason: "Manager hold",
  });
  assert.equal(blocked.blocksBilling, true);
  assert.equal(blocked.overLimit, true);
});
