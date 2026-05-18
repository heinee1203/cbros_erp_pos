import assert from "node:assert/strict";
import test from "node:test";

import { countBackfilledRows } from "./sales-backfill";

test("countBackfilledRows preserves existing backfill linked count behavior", () => {
  assert.equal(countBackfilledRows({ length: 3 }), 3);
  assert.equal(countBackfilledRows({ length: 0 }), 0);
  assert.equal(countBackfilledRows({}), 0);
  assert.equal(countBackfilledRows(null), 0);
});
