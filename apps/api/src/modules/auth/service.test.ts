import assert from "node:assert/strict";
import test from "node:test";

test("extractAuthorizationPin accepts typed, scanned, and swiped manager credentials", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { extractAuthorizationPin } = await import("./service");

  const cases = [
    ["1234", "1234"],
    ["PIN:1234", "1234"],
    ["AUTH=1234", "1234"],
    ["APEXAUTH1234", "1234"],
    ["APEX-MGR-1234", "1234"],
    ["APEX-MGR/1234", "1234"],
    ["MANAGER|1234", "1234"],
    ['{"pin":"1234"}', "1234"],
    ['{"managerPin":"1234"}', "1234"],
    ["apex://auth?pin=1234", "1234"],
    ["https://apex.local/auth?managerPin=1234", "1234"],
    ["MGR#1234", "1234"],
    [";1234=MANAGER?", "1234"],
    [";1234=APEXMANAGER?", "1234"],
    ["%B1234^APEX MANAGER?", "1234"],
    ["%B999999^APEX MANAGER^1234?", "1234"],
  ] as const;

  for (const [input, expected] of cases) {
    assert.equal(extractAuthorizationPin(input), expected, input);
  }
});

test("extractAuthorizationPin rejects credentials without a dedicated four digit secret", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { extractAuthorizationPin } = await import("./service");

  assert.equal(extractAuthorizationPin(""), null);
  assert.equal(extractAuthorizationPin("12345"), null);
  assert.equal(extractAuthorizationPin("MANAGER"), null);
  assert.equal(extractAuthorizationPin('{"pin":"12345"}'), null);
  assert.equal(extractAuthorizationPin("apex://auth?pin=12345"), null);
  assert.equal(extractAuthorizationPin("%B999999^APEX MANAGER?"), null);
  assert.equal(extractAuthorizationPin("%B999999^CUSTOMER NAME^2512?"), null);
  assert.equal(extractAuthorizationPin(";1234=SALECARD?"), null);
});
