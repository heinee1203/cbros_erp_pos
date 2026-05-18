import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImportLocationMappings,
  countRequestedLocationMappings,
} from "./location-mapping-service";

test("buildImportLocationMappings preserves route response mapping shape", () => {
  assert.deepEqual(
    buildImportLocationMappings([
      { csv_location_name: "Main", apex_location_id: "loc_1" },
      { csv_location_name: "Branch", apex_location_id: "loc_2" },
    ]),
    {
      Main: "loc_1",
      Branch: "loc_2",
    },
  );
});

test("countRequestedLocationMappings keeps saved count based on submitted keys", () => {
  assert.equal(countRequestedLocationMappings({ Main: "loc_1", Empty: "" }), 2);
  assert.equal(countRequestedLocationMappings({}), 0);
});
