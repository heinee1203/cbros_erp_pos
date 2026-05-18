export type BankAccountCreateInput = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string;
  isDefault?: boolean;
};

export type BankAccountUpdateInput = {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  branch?: string;
  isDefault?: boolean;
};

export function maskBankAccountNumber(accountNumber: string) {
  return accountNumber.length > 4
    ? "****" + accountNumber.slice(-4)
    : accountNumber;
}

export function buildBankAccountCreateValues(
  orgId: string,
  data: BankAccountCreateInput,
) {
  return {
    orgId,
    bankName: data.bankName,
    accountName: data.accountName,
    accountNumber: data.accountNumber,
    accountNumberDisplay: maskBankAccountNumber(data.accountNumber),
    branch: data.branch ?? null,
    isDefault: data.isDefault ?? false,
  };
}

export function buildBankAccountUpdateFields(data: BankAccountUpdateInput) {
  const updates: Record<string, any> = {};

  if (data.bankName !== undefined) updates.bankName = data.bankName;
  if (data.accountName !== undefined) updates.accountName = data.accountName;
  if (data.branch !== undefined) updates.branch = data.branch;
  if (data.isDefault !== undefined) updates.isDefault = data.isDefault;
  if (data.accountNumber !== undefined) {
    updates.accountNumber = data.accountNumber;
    updates.accountNumberDisplay = maskBankAccountNumber(data.accountNumber);
  }

  return updates;
}
