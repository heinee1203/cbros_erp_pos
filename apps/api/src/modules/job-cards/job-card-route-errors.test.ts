import assert from "node:assert/strict";
import test from "node:test";
import { isContentionError, isIdempotencyError } from "./job-card-route-errors";

test("isIdempotencyError matches duplicate and idempotency conflicts", () => {
  assert.equal(isIdempotencyError(new Error("duplicate key value")), true);
  assert.equal(isIdempotencyError(new Error("job card already exists")), true);
  assert.equal(isIdempotencyError(new Error("idempotency key reused")), true);
});

test("isContentionError matches lock and deadlock conflicts", () => {
  assert.equal(isContentionError(new Error("could not obtain lock")), true);
  assert.equal(isContentionError(new Error("deadlock detected")), true);
  assert.equal(isContentionError(new Error("Row is locked")), true);
});

test("route error classifiers ignore unrelated validation failures", () => {
  const err = new Error("validation failed");

  assert.equal(isIdempotencyError(err), false);
  assert.equal(isContentionError(err), false);
});
