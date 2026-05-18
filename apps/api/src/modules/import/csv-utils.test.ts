import assert from "node:assert/strict";
import test from "node:test";

import { findColumn, isLoyverseFormat, parseCSV, parseCSVLine } from "./csv-utils";

test("findColumn resolves Loyverse aliases after trimming headers", () => {
  const headers = [" Item name ", "Sku", "Purchase cost", "Track Dot"];

  assert.equal(findColumn(headers, "name"), 0);
  assert.equal(findColumn(headers, "sku"), 1);
  assert.equal(findColumn(headers, "cost"), 2);
  assert.equal(findColumn(headers, "trackDot"), 3);
  assert.equal(findColumn(headers, "missing"), -1);
});

test("isLoyverseFormat requires name and sku aliases", () => {
  assert.equal(isLoyverseFormat(["Item name", "SKU"]), true);
  assert.equal(isLoyverseFormat(["Name", "Price"]), false);
  assert.equal(isLoyverseFormat(["SKU", "Cost"]), false);
});

test("parseCSV trims cells, handles quotes, BOM, CRLF, and skips empty rows", () => {
  assert.deepEqual(
    parseCSV('\uFEFFName,SKU,Description\r\n"Brake, Pad",BP-1,"Has ""quotes"""\r\n,,\r\nRotor,R-1,Plain'),
    [
      ["Name", "SKU", "Description"],
      ["Brake, Pad", "BP-1", 'Has "quotes"'],
      ["Rotor", "R-1", "Plain"],
    ],
  );
});

test("parseCSV keeps embedded newlines inside quoted cells", () => {
  assert.deepEqual(parseCSV('Name,Notes\n"Brake Pad","line 1\nline 2"'), [
    ["Name", "Notes"],
    ["Brake Pad", "line 1\nline 2"],
  ]);
});

test("parseCSVLine preserves cell whitespace for receipts parsing", () => {
  assert.deepEqual(parseCSVLine('A,"B, C","D ""quoted""", E '), [
    "A",
    "B, C",
    'D "quoted"',
    " E ",
  ]);
});
