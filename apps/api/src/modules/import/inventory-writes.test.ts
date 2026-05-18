import assert from "node:assert/strict";
import test from "node:test";

import type { DbOrTx } from "@apex/database";
import { upsertInventoryQuantityForProduct } from "./inventory-writes";

function fakeTx(existingInventoryId: string | null) {
  const calls: Array<{ op: string; payload?: unknown }> = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(existingInventoryId ? [{ id: existingInventoryId }] : []),
        }),
      }),
    }),
    update: () => ({
      set: (payload: unknown) => {
        calls.push({ op: "update", payload });
        return {
          where: () => {
            calls.push({ op: "where" });
            return Promise.resolve();
          },
        };
      },
    }),
    insert: () => ({
      values: (payload: unknown) => {
        calls.push({ op: "insert", payload });
        return Promise.resolve();
      },
    }),
  } as unknown as DbOrTx;

  return { tx, calls };
}

test("upsertInventoryQuantityForProduct updates only explicit quantity cells", async () => {
  const { tx, calls } = fakeTx("inv_1");

  await upsertInventoryQuantityForProduct(tx, "org_1", "prod_1", [
    {
      apexLocationId: "loc_blank",
      stockLevel: 0,
      stockLevelWasPresent: false,
      available: false,
      reorderPoint: 5,
      optimalStock: 10,
    },
    {
      apexLocationId: null,
      stockLevel: 99,
      stockLevelWasPresent: true,
      available: false,
      reorderPoint: 5,
      optimalStock: 10,
    },
    {
      apexLocationId: "loc_1",
      stockLevel: 7,
      stockLevelWasPresent: true,
      available: false,
      reorderPoint: 5,
      optimalStock: 10,
    },
  ]);

  assert.deepEqual(calls, [
    { op: "update", payload: { stockLevel: 7 } },
    { op: "where" },
  ]);
});

test("upsertInventoryQuantityForProduct inserts missing inventory with neutral defaults", async () => {
  const { tx, calls } = fakeTx(null);

  await upsertInventoryQuantityForProduct(tx, "org_1", "prod_1", [
    {
      apexLocationId: "loc_1",
      stockLevel: 7,
      stockLevelWasPresent: true,
      available: false,
      reorderPoint: 5,
      optimalStock: 10,
    },
  ]);

  assert.deepEqual(calls, [
    {
      op: "insert",
      payload: {
        orgId: "org_1",
        productId: "prod_1",
        locationId: "loc_1",
        stockLevel: 7,
        availableForSale: true,
        reorderPoint: 0,
        optimalStock: 0,
      },
    },
  ]);
});
