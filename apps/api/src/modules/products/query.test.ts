import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStandardProductListConditions,
  canIncludeInactiveProducts,
  isGroupedProductQuery,
  isUuid,
  parseProductPagination,
  parseProductSort,
  resolveProductScope,
} from "./query";

test("resolveProductScope uses all-locations mode when requested or when no location is scoped", () => {
  assert.equal(resolveProductScope({ allLocations: "true" }, "loc_1"), true);
  assert.equal(resolveProductScope({}, null), true);
  assert.equal(resolveProductScope({}, "loc_1"), false);
});

test("parseProductPagination clamps invalid and oversized input", () => {
  assert.deepEqual(parseProductPagination({ page: "-4", limit: "9999" }), {
    page: 1,
    limit: 500,
    offset: 0,
  });
  assert.deepEqual(parseProductPagination({ page: "3", limit: "25" }), {
    page: 3,
    limit: 25,
    offset: 50,
  });
});

test("parseProductSort defaults unknown fields and only accepts descending explicitly", () => {
  assert.deepEqual(parseProductSort({ sortBy: "definitely-not-real", sortDir: "desc" }), {
    sortBy: "name",
    sortDir: "desc",
  });
  assert.deepEqual(parseProductSort({ sortBy: "stockLevel", sortDir: "sideways" }), {
    sortBy: "stockLevel",
    sortDir: "asc",
  });
});

test("grouped and inactive flags preserve existing role gates", () => {
  assert.equal(isGroupedProductQuery({ grouped: "true" }), true);
  assert.equal(isGroupedProductQuery({ grouped: "false" }), false);
  assert.equal(canIncludeInactiveProducts({ includeInactive: "true" }, "ADMIN"), true);
  assert.equal(canIncludeInactiveProducts({ includeInactive: "true" }, "MANAGER"), true);
  assert.equal(canIncludeInactiveProducts({ includeInactive: "true" }, "CASHIER"), false);
  assert.equal(canIncludeInactiveProducts({ includeInactive: "false" }, "ADMIN"), false);
});

test("buildStandardProductListConditions preserves parent-only and inactive filters", () => {
  const cashierResult = buildStandardProductListConditions({
    q: { includeInactive: "true", parentOnly: "true" },
    orgId: "org_1",
    locationId: "loc_1",
    role: "CASHIER",
  });
  const adminResult = buildStandardProductListConditions({
    q: { includeInactive: "true", parentOnly: "true" },
    orgId: "org_1",
    locationId: "loc_1",
    role: "ADMIN",
  });

  assert.equal(cashierResult.parentOnly, true);
  assert.equal(adminResult.parentOnly, true);
  assert.equal(cashierResult.conditions.length, adminResult.conditions.length + 1);
});

test("isUuid accepts canonical UUIDs only", () => {
  assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUuid("123e4567-e89b-12d3-a456-42661417400z"), false);
  assert.equal(isUuid("not-a-uuid"), false);
});
