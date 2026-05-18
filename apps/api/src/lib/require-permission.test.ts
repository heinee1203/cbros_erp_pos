import test from "node:test";
import assert from "node:assert/strict";
import { hasAnyPermission, hasPermission } from "./require-permission";

test("hasPermission fails closed when the JWT has no permissions", () => {
  assert.equal(hasPermission([], "bo.manage_inventory"), false);
});

test("hasPermission only allows explicitly granted permissions", () => {
  assert.equal(hasPermission(["bo.manage_inventory"], "bo.manage_inventory"), true);
  assert.equal(hasPermission(["bo.manage_inventory"], "bo.manage_items"), false);
});

test("hasAnyPermission allows any matching permission", () => {
  assert.equal(
    hasAnyPermission(["pos.accept_payments"], ["pos.perform_refunds", "pos.accept_payments"]),
    true,
  );
  assert.equal(
    hasAnyPermission(["pos.view_receipts"], ["pos.perform_refunds", "pos.void_sale"]),
    false,
  );
});
