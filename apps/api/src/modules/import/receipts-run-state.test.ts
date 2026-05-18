import assert from "node:assert/strict";
import test from "node:test";

import {
  RECEIPT_IMPORT_BATCH_SIZE,
  buildReceiptsImportResult,
  createReceiptCompletedProgress,
  createReceiptImportRunState,
  createReceiptInitialProgress,
  createReceiptRunningProgress,
  recordReceiptBatchError,
  recordReceiptRowError,
} from "./receipts-run-state";

test("receipt run state starts with the existing receipt import counters", () => {
  assert.equal(RECEIPT_IMPORT_BATCH_SIZE, 500);
  assert.deepEqual(createReceiptImportRunState(), {
    created: 0,
    skipped: 0,
    priceBackfilled: 0,
    errors: [],
  });
});

test("receipt error helpers preserve row and batch error accounting", () => {
  const state = createReceiptImportRunState();

  recordReceiptRowError(state, 7, undefined);
  recordReceiptBatchError(state, 11, "database failed");

  assert.deepEqual(state, {
    created: 0,
    skipped: 1,
    priceBackfilled: 0,
    errors: [
      { row: 7, message: "Unknown error" },
      { row: 11, message: "Batch error: database failed" },
    ],
  });
});

test("receipt progress builders preserve progress payload shapes", () => {
  const state = createReceiptImportRunState();
  state.created = 3;
  state.errors.push({ row: 2, message: "Bad receipt" });

  assert.deepEqual(createReceiptInitialProgress(20), {
    status: "running",
    processed: 0,
    total: 20,
    percent: 0,
    created: 0,
    updated: 0,
    errors: 0,
  });
  assert.deepEqual(createReceiptRunningProgress(500, 500, 700, state), {
    status: "running",
    processed: 700,
    total: 700,
    percent: 143,
    created: 3,
    updated: 0,
    errors: 1,
  });
  assert.deepEqual(createReceiptCompletedProgress(700, state), {
    status: "completed",
    processed: 700,
    total: 700,
    percent: 100,
    created: 3,
    updated: 0,
    errors: 1,
  });
});

test("buildReceiptsImportResult preserves receipt import result shape", () => {
  const state = createReceiptImportRunState();
  state.created = 4;
  state.skipped = 2;
  state.priceBackfilled = 1;
  state.errors.push({ row: 3, message: "Invalid date" });

  assert.deepEqual(buildReceiptsImportResult(state, "batch_1"), {
    created: 4,
    skipped: 2,
    priceBackfilled: 1,
    errors: 1,
    errorLog: [{ row: 3, message: "Invalid date" }],
    batchId: "batch_1",
  });
});
