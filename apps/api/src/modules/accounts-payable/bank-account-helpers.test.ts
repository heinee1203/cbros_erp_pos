import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBankAccountCreateValues,
  buildBankAccountUpdateFields,
  maskBankAccountNumber,
} from "./bank-account-helpers";

test("maskBankAccountNumber preserves short numbers and masks longer ones", () => {
  assert.equal(maskBankAccountNumber("1234"), "1234");
  assert.equal(maskBankAccountNumber("12345"), "****2345");
  assert.equal(maskBankAccountNumber("000012345678"), "****5678");
});

test("buildBankAccountCreateValues preserves defaults and display masking", () => {
  assert.deepEqual(
    buildBankAccountCreateValues("org-1", {
      bankName: "BPI",
      accountName: "AP Clearing",
      accountNumber: "123456789",
    }),
    {
      orgId: "org-1",
      bankName: "BPI",
      accountName: "AP Clearing",
      accountNumber: "123456789",
      accountNumberDisplay: "****6789",
      branch: null,
      isDefault: false,
    },
  );

  assert.deepEqual(
    buildBankAccountCreateValues("org-1", {
      bankName: "BDO",
      accountName: "Main",
      accountNumber: "9876",
      branch: "Makati",
      isDefault: true,
    }),
    {
      orgId: "org-1",
      bankName: "BDO",
      accountName: "Main",
      accountNumber: "9876",
      accountNumberDisplay: "9876",
      branch: "Makati",
      isDefault: true,
    },
  );
});

test("buildBankAccountUpdateFields preserves partial update semantics", () => {
  assert.deepEqual(buildBankAccountUpdateFields({}), {});
  assert.deepEqual(
    buildBankAccountUpdateFields({
      bankName: "Metrobank",
      branch: "",
      isDefault: false,
    }),
    {
      bankName: "Metrobank",
      branch: "",
      isDefault: false,
    },
  );
  assert.deepEqual(
    buildBankAccountUpdateFields({
      accountNumber: "123456",
    }),
    {
      accountNumber: "123456",
      accountNumberDisplay: "****3456",
    },
  );
});
