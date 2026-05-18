import assert from "node:assert/strict";
import test from "node:test";

async function getBuildFieldRestorePlan() {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const mod = await import("./import-rollback");
  return mod.buildFieldRestorePlan;
}

test("buildFieldRestorePlan restores only changed fields when current still matches import after-value", async () => {
  const buildFieldRestorePlan = await getBuildFieldRestorePlan();
  const plan = buildFieldRestorePlan({
    before: { barcode: "OLD", unitPrice: "10.00", name: "Same" },
    after: { barcode: "NEW", unitPrice: "12.00", name: "Same" },
    current: { barcode: "NEW", unitPrice: "12.00", name: "Same" },
    fields: ["barcode", "unitPrice", "name"],
  });

  assert.deepEqual(plan.updates, { barcode: "OLD", unitPrice: "10.00" });
  assert.equal(plan.restorableFields, 2);
  assert.equal(plan.alreadyRestoredFields, 0);
  assert.deepEqual(plan.conflicts, []);
});

test("buildFieldRestorePlan reports conflicts when current value changed after import", async () => {
  const buildFieldRestorePlan = await getBuildFieldRestorePlan();
  const plan = buildFieldRestorePlan({
    before: { barcode: "OLD" },
    after: { barcode: "NEW" },
    current: { barcode: "MANUAL" },
    fields: ["barcode"],
  });

  assert.deepEqual(plan.updates, {});
  assert.equal(plan.restorableFields, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0]?.field, "barcode");
  assert.equal(plan.conflicts[0]?.expectedAfterValue, "NEW");
  assert.equal(plan.conflicts[0]?.currentValue, "MANUAL");
});

test("buildFieldRestorePlan treats already-restored fields as safe no-ops", async () => {
  const buildFieldRestorePlan = await getBuildFieldRestorePlan();
  const plan = buildFieldRestorePlan({
    before: { stockLevel: 5 },
    after: { stockLevel: 8 },
    current: { stockLevel: 5 },
    fields: ["stockLevel"],
  });

  assert.deepEqual(plan.updates, {});
  assert.equal(plan.alreadyRestoredFields, 1);
  assert.deepEqual(plan.conflicts, []);
});

test("buildFieldRestorePlan ignores fields that were not changed by the import", async () => {
  const buildFieldRestorePlan = await getBuildFieldRestorePlan();
  const plan = buildFieldRestorePlan({
    before: { name: "Brake Pad" },
    after: { name: "Brake Pad" },
    current: { name: "Manual Rename" },
    fields: ["name"],
  });

  assert.deepEqual(plan.updates, {});
  assert.equal(plan.restorableFields, 0);
  assert.equal(plan.alreadyRestoredFields, 0);
  assert.deepEqual(plan.conflicts, []);
});
