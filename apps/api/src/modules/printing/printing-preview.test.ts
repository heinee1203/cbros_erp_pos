import assert from "node:assert/strict";
import test from "node:test";
import { buildLabelaryUrl, toPngDataUrl } from "./printing-preview";

test("buildLabelaryUrl preserves Labelary dimensions and density format", () => {
  assert.equal(
    buildLabelaryUrl(50, 30, 8),
    "http://api.labelary.com/v1/printers/8dpmm/labels/1.97x1.18/0/",
  );
});

test("toPngDataUrl preserves the PNG data URL prefix and base64 payload", () => {
  const buffer = Buffer.from("png-bytes");

  assert.equal(
    toPngDataUrl(buffer),
    "data:image/png;base64,cG5nLWJ5dGVz",
  );
});
