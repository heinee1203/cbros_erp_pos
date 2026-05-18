import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRawPrintScript,
  escapePowerShellSingleQuotedValue,
} from "./printing-raw-script";

test("escapePowerShellSingleQuotedValue doubles single quotes", () => {
  assert.equal(
    escapePowerShellSingleQuotedValue("Bob's Zebra"),
    "Bob''s Zebra",
  );
});

test("buildRawPrintScript preserves raw spooler script and escaped arguments", () => {
  const script = buildRawPrintScript(
    "Bob's Zebra",
    String.raw`C:\Temp\zpl-o'hara.txt`,
  );

  assert.match(script, /public class RawPrinterHelper/);
  assert.match(script, /pDatatype = "RAW"/);
  assert.match(
    script,
    /\[RawPrinterHelper\]::SendFileToPrinter\('Bob''s Zebra', 'C:\\\\Temp\\\\zpl-o''hara.txt'\)/,
  );
  assert.match(script, /if \(-not \$result\) { exit 1 }/);
});
