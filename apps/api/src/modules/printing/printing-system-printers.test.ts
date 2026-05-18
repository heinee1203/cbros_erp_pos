import assert from "node:assert/strict";
import test from "node:test";
import {
  LIST_SYSTEM_PRINTERS_COMMAND,
  normalizeSystemPrinters,
} from "./printing-system-printers";

test("LIST_SYSTEM_PRINTERS_COMMAND preserves the existing PowerShell query", () => {
  assert.equal(
    LIST_SYSTEM_PRINTERS_COMMAND,
    'powershell -NoProfile -Command "Get-Printer | Select-Object Name, PortName, DriverName, PrinterStatus | ConvertTo-Json -Compress"',
  );
});

test("normalizeSystemPrinters wraps a single printer object", () => {
  assert.deepEqual(
    normalizeSystemPrinters('{"Name":"Zebra","PortName":"USB001"}'),
    [{ Name: "Zebra", PortName: "USB001" }],
  );
});

test("normalizeSystemPrinters preserves printer arrays", () => {
  assert.deepEqual(
    normalizeSystemPrinters(
      '[{"Name":"Zebra","PortName":"USB001"},{"Name":"Office","PortName":"WSD"}]',
    ),
    [
      { Name: "Zebra", PortName: "USB001" },
      { Name: "Office", PortName: "WSD" },
    ],
  );
});
