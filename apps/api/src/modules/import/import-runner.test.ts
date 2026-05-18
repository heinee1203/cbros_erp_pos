import assert from "node:assert/strict";
import test from "node:test";

import {
  applyImportRowExecutionResult,
  createImportRunState,
  handleInvalidImportRow,
  handleNoChangeImportRow,
  recordImportBatchError,
  recordImportRowError,
  runImportBatches,
  type ImportBatchProgress,
  type ImportTransaction,
} from "./import-runner";
import type { ParsedRow } from "./types";

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    rowIndex: 1,
    name: "Brake Pad",
    sku: "BP-1",
    barcode: "",
    costPrice: "300.00",
    unitPrice: "500.00",
    isVariablePrice: false,
    categoryName: "",
    brandName: "",
    description: "",
    handle: "",
    option1Name: "",
    option1Value: "",
    option2Name: "",
    option2Value: "",
    option3Name: "",
    option3Value: "",
    resolvedName: "Brake Pad",
    isVariant: false,
    parentName: "",
    active: null,
    sellingUnit: "",
    trackSerial: null,
    trackDot: null,
    specialOrder: null,
    oemNumber: "",
    supplierName: "",
    locations: [],
    action: "CREATE",
    existingProductId: null,
    changes: [],
    errors: [],
    ...overrides,
  };
}

function fakeTransaction() {
  const executed: unknown[] = [];
  const tx = {
    execute: async (query: unknown) => {
      executed.push(query);
    },
  } as ImportTransaction;

  return {
    executed,
    runTransaction: async (callback: (tx: ImportTransaction) => Promise<void>) => {
      await callback(tx);
    },
  };
}

test("handleInvalidImportRow preserves validation skip and error logging policy", () => {
  const logState = createImportRunState();
  assert.equal(
    handleInvalidImportRow(logState, row({ rowIndex: 7, errors: ["Bad SKU", "Bad price"] }), false),
    true,
  );
  assert.equal(logState.skipped, 1);
  assert.deepEqual(logState.errors, [
    { row: 7, message: "Bad SKU" },
    { row: 7, message: "Bad price" },
  ]);

  const skipState = createImportRunState();
  assert.equal(handleInvalidImportRow(skipState, row({ errors: ["Bad SKU"] }), true), true);
  assert.equal(skipState.skipped, 1);
  assert.deepEqual(skipState.errors, []);
});

test("handleNoChangeImportRow counts no-op rows before savepoints", () => {
  const state = createImportRunState();

  assert.equal(handleNoChangeImportRow(state, row({ action: "NO_CHANGE" })), true);
  assert.equal(state.noChange, 1);
  assert.equal(handleNoChangeImportRow(state, row({ action: "CREATE" })), false);
  assert.equal(state.noChange, 1);
});

test("applyImportRowExecutionResult updates only matching counters", () => {
  const state = createImportRunState();

  applyImportRowExecutionResult(state, "created");
  applyImportRowExecutionResult(state, "updated");
  applyImportRowExecutionResult(state, "skipped");
  applyImportRowExecutionResult(state, "none");

  assert.deepEqual(
    {
      created: state.created,
      updated: state.updated,
      skipped: state.skipped,
      noChange: state.noChange,
    },
    { created: 1, updated: 1, skipped: 1, noChange: 0 },
  );
});

test("recordImportRowError and recordImportBatchError preserve messages", () => {
  const state = createImportRunState();

  recordImportRowError(state, 4, new Error("Row failed"));
  recordImportBatchError(state, 500, new Error("Batch failed"));

  assert.equal(state.skipped, 1);
  assert.deepEqual(state.errors, [
    { row: 4, message: "Row failed" },
    { row: 501, message: "Batch error: Batch failed" },
  ]);
});

test("runImportBatches skips validation and no-change rows without savepoints", async () => {
  const { executed, runTransaction } = fakeTransaction();
  const progress: ImportBatchProgress[] = [];
  const writtenRows: number[] = [];

  const result = await runImportBatches({
    rows: [
      row({ rowIndex: 1, action: "NO_CHANGE" }),
      row({ rowIndex: 2, errors: ["Bad SKU"] }),
      row({ rowIndex: 3, action: "CREATE" }),
    ],
    orgId: "org_1",
    mode: "smart_sync",
    categoryCache: new Map(),
    brandCache: new Map(),
    parentProductMap: new Map(),
    generateMnemonicSku: async () => "MN-BP-1",
    runTransaction,
    onBatchComplete: (snapshot) => progress.push(snapshot),
    writeRow: async ({ row }) => {
      writtenRows.push(row.rowIndex);
      return "created";
    },
    batchSize: 10,
  });

  assert.deepEqual(writtenRows, [3]);
  assert.equal(executed.length, 2);
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.noChange, 1);
  assert.deepEqual(result.errors, [{ row: 2, message: "Bad SKU" }]);
  assert.deepEqual(progress.map((snapshot) => snapshot.processed), [3]);
});

test("runImportBatches records row errors and continues when skipErrors is enabled", async () => {
  const { executed, runTransaction } = fakeTransaction();

  const result = await runImportBatches({
    rows: [
      row({ rowIndex: 1, action: "CREATE" }),
      row({ rowIndex: 2, action: "UPDATE", existingProductId: "prod_2" }),
    ],
    orgId: "org_1",
    mode: "smart_sync",
    skipErrors: true,
    categoryCache: new Map(),
    brandCache: new Map(),
    parentProductMap: new Map(),
    generateMnemonicSku: async () => "MN-BP-1",
    runTransaction,
    writeRow: async ({ row }) => {
      if (row.rowIndex === 1) throw new Error("Create failed");
      return "updated";
    },
    batchSize: 10,
  });

  assert.equal(executed.length, 4);
  assert.equal(result.updated, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.errors, [{ row: 1, message: "Create failed" }]);
});

test("runImportBatches records batch errors when row errors are not skipped", async () => {
  const { runTransaction } = fakeTransaction();

  const result = await runImportBatches({
    rows: [row({ rowIndex: 9, action: "CREATE" })],
    orgId: "org_1",
    mode: "smart_sync",
    skipErrors: false,
    categoryCache: new Map(),
    brandCache: new Map(),
    parentProductMap: new Map(),
    generateMnemonicSku: async () => "MN-BP-1",
    runTransaction,
    writeRow: async () => {
      throw new Error("Create failed");
    },
    batchSize: 10,
  });

  assert.equal(result.skipped, 0);
  assert.deepEqual(result.errors, [{ row: 1, message: "Batch error: Create failed" }]);
});
