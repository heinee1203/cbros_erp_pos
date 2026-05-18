import assert from "node:assert/strict";
import test from "node:test";

import { buildNameIdCache } from "./taxonomy-cache-loader";

test("buildNameIdCache lowercases names and preserves existing overwrite behavior", () => {
  const cache = buildNameIdCache([
    { id: "cat_1", name: "Brakes" },
    { id: "cat_2", name: "TIRES" },
    { id: "cat_3", name: "brakes" },
  ]);

  assert.equal(cache.get("brakes"), "cat_3");
  assert.equal(cache.get("tires"), "cat_2");
  assert.equal(cache.has("Brakes"), false);
});
