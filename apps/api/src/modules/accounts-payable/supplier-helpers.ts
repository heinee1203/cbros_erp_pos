export type SupplierApStatsRow = {
  id: string;
  name: string;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  tin: string | null;
  mnemonic_code: string | null;
  payment_terms_days: number | null;
  credit_limit: string | number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  open_count: number;
  total_payable: string | number | null;
  overdue_count: number;
  overdue_amount: string | number | null;
  oldest_overdue_date: string | null;
  last_bank_change_at?: Date | string | null;
  bank_change_count?: number | string | null;
  bank_verified_at?: Date | string | null;
  bank_verified_by?: string | null;
  bank_verified_by_name?: string | null;
};

export type SupplierApDetailRow = Omit<
  SupplierApStatsRow,
  "open_count" | "total_payable" | "overdue_count" | "overdue_amount" | "oldest_overdue_date"
> & {
  avg_lead_time_days: number | null;
  last_bank_change_at?: Date | string | null;
  bank_change_count?: number | string | null;
  bank_verified_at?: Date | string | null;
  bank_verified_by?: string | null;
  bank_verified_by_name?: string | null;
};

export type SupplierMissingFieldKey =
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountName"
  | "tin"
  | "address"
  | "contactPerson"
  | "contactPhoneOrEmail"
  | "paymentTerms"
  | "active";

export type SupplierRiskSeverity = "info" | "warning" | "critical";

export type SupplierCompletenessMissingField = {
  key: SupplierMissingFieldKey;
  label: string;
};

export type SupplierDuplicateWarning = {
  field: "tin" | "bankAccountNumber" | "name" | "contactPhone";
  label: string;
  severity: Exclude<SupplierRiskSeverity, "info">;
  matchedSupplierId: string;
  matchedSupplierName: string;
};

export type SupplierRiskBadge = {
  code:
    | "MISSING_BANK"
    | "BANK_UNVERIFIED"
    | "BANK_NEEDS_REVIEW"
    | "MISSING_TIN"
    | "MISSING_ADDRESS"
    | "MISSING_CONTACT"
    | "DUPLICATE"
    | "INACTIVE_WITH_BALANCE"
    | "OVERDUE"
    | "BANK_CHANGED";
  label: string;
  severity: SupplierRiskSeverity;
};

export type SupplierBankVerificationStatus =
  | "missing"
  | "unverified"
  | "verified"
  | "needs_review";

export type SupplierSafetyMetadata = {
  score: number;
  isComplete: boolean;
  paymentReady: boolean;
  missingFields: SupplierCompletenessMissingField[];
};

export type SupplierSafetySource = {
  id: string;
  name: string;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  tin: string | null;
  paymentTermsDays: number | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  isActive: boolean;
  openCount?: number;
  totalPayable?: number;
  overdueCount?: number;
  lastBankChangeAt?: Date | string | null;
  bankChangeCount?: number;
  bankVerifiedAt?: Date | string | null;
  bankVerifiedBy?: string | null;
  bankVerifiedByName?: string | null;
};

export type SupplierChangedField = {
  field: keyof SupplierApUpdateInput;
  label: string;
  before: unknown;
  after: unknown;
};

export const SUPPLIER_BANK_FIELD_KEYS = [
  "bankName",
  "bankAccountNumber",
  "bankAccountName",
] as const;

const SUPPLIER_UPDATE_LABELS: Record<keyof SupplierApUpdateInput, string> = {
  name: "Supplier name",
  contactPerson: "Contact person",
  contactPhone: "Contact phone",
  contactEmail: "Contact email",
  address: "Address",
  tin: "TIN",
  mnemonicCode: "Mnemonic code",
  paymentTermsDays: "Payment terms",
  creditLimit: "Credit limit",
  bankName: "Bank name",
  bankAccountNumber: "Bank account number",
  bankAccountName: "Bank account name",
  notes: "Notes",
  isActive: "Active status",
};

const COMPLETENESS_FIELDS: Array<{
  key: SupplierMissingFieldKey;
  label: string;
  isPresent: (supplier: SupplierSafetySource) => boolean;
}> = [
  { key: "bankName", label: "Bank name", isPresent: (s) => hasText(s.bankName) },
  { key: "bankAccountNumber", label: "Bank account number", isPresent: (s) => hasText(s.bankAccountNumber) },
  { key: "bankAccountName", label: "Bank account name", isPresent: (s) => hasText(s.bankAccountName) },
  { key: "tin", label: "TIN", isPresent: (s) => hasText(s.tin) },
  { key: "address", label: "Address", isPresent: (s) => hasText(s.address) },
  { key: "contactPerson", label: "Contact person", isPresent: (s) => hasText(s.contactPerson) },
  {
    key: "contactPhoneOrEmail",
    label: "Contact phone or email",
    isPresent: (s) => hasText(s.contactPhone) || hasText(s.contactEmail),
  },
  {
    key: "paymentTerms",
    label: "Payment terms",
    isPresent: (s) => typeof s.paymentTermsDays === "number" && s.paymentTermsDays >= 0,
  },
  { key: "active", label: "Active supplier", isPresent: (s) => s.isActive },
];

export type SupplierApUpdateInput = {
  name?: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  tin?: string | null;
  mnemonicCode?: string | null;
  paymentTermsDays?: number;
  creditLimit?: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export type SupplierApCreateInput = Omit<SupplierApUpdateInput, "isActive"> & {
  name: string;
};

export function mapSupplierApStatsRow(row: SupplierApStatsRow) {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    address: row.address,
    tin: row.tin,
    mnemonicCode: row.mnemonic_code,
    paymentTermsDays: row.payment_terms_days,
    creditLimit: Number.parseFloat(String(row.credit_limit)),
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankAccountName: row.bank_account_name,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    openCount: row.open_count,
    totalPayable: Number.parseFloat(String(row.total_payable)),
    overdueCount: row.overdue_count,
    overdueAmount: Number.parseFloat(String(row.overdue_amount)),
    oldestOverdueDate: row.oldest_overdue_date,
    lastBankChangeAt: row.last_bank_change_at ?? null,
    bankChangeCount: Number.parseInt(String(row.bank_change_count ?? 0), 10),
    bankVerifiedAt: row.bank_verified_at ?? null,
    bankVerifiedBy: row.bank_verified_by ?? null,
    bankVerifiedByName: row.bank_verified_by_name ?? null,
  };
}

export function mapSupplierApDetailRow(row: SupplierApDetailRow) {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    address: row.address,
    tin: row.tin,
    mnemonicCode: row.mnemonic_code,
    paymentTermsDays: row.payment_terms_days,
    creditLimit: Number.parseFloat(String(row.credit_limit)),
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankAccountName: row.bank_account_name,
    notes: row.notes,
    isActive: row.is_active,
    avgLeadTimeDays: row.avg_lead_time_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastBankChangeAt: row.last_bank_change_at ?? null,
    bankChangeCount: Number.parseInt(String(row.bank_change_count ?? 0), 10),
    bankVerifiedAt: row.bank_verified_at ?? null,
    bankVerifiedBy: row.bank_verified_by ?? null,
    bankVerifiedByName: row.bank_verified_by_name ?? null,
  };
}

export function buildSupplierBankVerificationStatus(
  supplier: SupplierSafetySource,
): SupplierBankVerificationStatus {
  const hasBankDetails = hasText(supplier.bankName)
    && hasText(supplier.bankAccountNumber)
    && hasText(supplier.bankAccountName);
  if (!hasBankDetails) return "missing";

  const verifiedAt = supplier.bankVerifiedAt
    ? new Date(supplier.bankVerifiedAt).getTime()
    : NaN;
  if (!Number.isFinite(verifiedAt)) {
    return supplier.lastBankChangeAt || (supplier.bankChangeCount ?? 0) > 0
      ? "needs_review"
      : "unverified";
  }

  const changedAt = supplier.lastBankChangeAt
    ? new Date(supplier.lastBankChangeAt).getTime()
    : NaN;
  if (Number.isFinite(changedAt) && changedAt > verifiedAt) {
    return "needs_review";
  }

  return "verified";
}

export function buildSupplierCompleteness(
  supplier: SupplierSafetySource,
): SupplierSafetyMetadata {
  const missingFields = COMPLETENESS_FIELDS
    .filter((field) => !field.isPresent(supplier))
    .map(({ key, label }) => ({ key, label }));
  const presentCount = COMPLETENESS_FIELDS.length - missingFields.length;
  const score = Math.round((presentCount / COMPLETENESS_FIELDS.length) * 100);
  const paymentReady = hasText(supplier.bankName)
    && hasText(supplier.bankAccountNumber)
    && hasText(supplier.bankAccountName);

  return {
    score,
    isComplete: missingFields.length === 0,
    paymentReady,
    missingFields,
  };
}

export function buildSupplierDuplicateWarnings(
  supplier: SupplierSafetySource,
  allSuppliers: SupplierSafetySource[],
): SupplierDuplicateWarning[] {
  const warnings: SupplierDuplicateWarning[] = [];
  const seen = new Set<string>();

  const addWarning = (
    field: SupplierDuplicateWarning["field"],
    label: string,
    severity: SupplierDuplicateWarning["severity"],
    matchedSupplier: SupplierSafetySource,
  ) => {
    const key = `${field}:${matchedSupplier.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({
      field,
      label,
      severity,
      matchedSupplierId: matchedSupplier.id,
      matchedSupplierName: matchedSupplier.name,
    });
  };

  const tin = normalizeIdentifier(supplier.tin);
  const bankAccount = normalizeIdentifier(supplier.bankAccountNumber);
  const name = normalizeName(supplier.name);
  const phone = normalizePhone(supplier.contactPhone);

  for (const other of allSuppliers) {
    if (other.id === supplier.id) continue;
    if (tin && tin === normalizeIdentifier(other.tin)) {
      addWarning("tin", "Same TIN", "critical", other);
    }
    if (bankAccount && bankAccount === normalizeIdentifier(other.bankAccountNumber)) {
      addWarning("bankAccountNumber", "Same bank account", "critical", other);
    }
    if (name && name === normalizeName(other.name)) {
      addWarning("name", "Same supplier name", "warning", other);
    }
    if (phone && phone === normalizePhone(other.contactPhone)) {
      addWarning("contactPhone", "Same contact phone", "warning", other);
    }
  }

  return warnings;
}

export function buildSupplierRiskBadges(
  supplier: SupplierSafetySource,
  safety: SupplierSafetyMetadata,
  duplicateWarnings: SupplierDuplicateWarning[],
): SupplierRiskBadge[] {
  const badges: SupplierRiskBadge[] = [];
  const missingKeys = new Set(safety.missingFields.map((field) => field.key));
  const totalPayable = supplier.totalPayable ?? 0;
  const overdueCount = supplier.overdueCount ?? 0;

  if (!safety.paymentReady) {
    badges.push({ code: "MISSING_BANK", label: "Missing bank", severity: "critical" });
  } else {
    const bankStatus = buildSupplierBankVerificationStatus(supplier);
    if (bankStatus === "unverified") {
      badges.push({ code: "BANK_UNVERIFIED", label: "Bank unverified", severity: "warning" });
    } else if (bankStatus === "needs_review") {
      badges.push({ code: "BANK_NEEDS_REVIEW", label: "Verify bank change", severity: "critical" });
    }
  }
  if (missingKeys.has("tin")) {
    badges.push({ code: "MISSING_TIN", label: "Missing TIN", severity: "warning" });
  }
  if (missingKeys.has("address")) {
    badges.push({ code: "MISSING_ADDRESS", label: "Missing address", severity: "warning" });
  }
  if (missingKeys.has("contactPerson") || missingKeys.has("contactPhoneOrEmail")) {
    badges.push({ code: "MISSING_CONTACT", label: "Missing contact", severity: "warning" });
  }
  if (duplicateWarnings.length > 0) {
    const hasCritical = duplicateWarnings.some((warning) => warning.severity === "critical");
    badges.push({
      code: "DUPLICATE",
      label: hasCritical ? "Critical duplicate" : "Possible duplicate",
      severity: hasCritical ? "critical" : "warning",
    });
  }
  if (!supplier.isActive && totalPayable > 0) {
    badges.push({
      code: "INACTIVE_WITH_BALANCE",
      label: "Inactive with payable",
      severity: "critical",
    });
  }
  if (overdueCount > 0) {
    badges.push({ code: "OVERDUE", label: "Overdue", severity: "warning" });
  }
  if ((supplier.bankChangeCount ?? 0) > 0 || supplier.lastBankChangeAt) {
    badges.push({ code: "BANK_CHANGED", label: "Bank changed", severity: "info" });
  }

  return badges;
}

export function enrichSuppliersWithSafety<T extends SupplierSafetySource>(
  suppliersToEnrich: T[],
) {
  return suppliersToEnrich.map((supplier) => {
    const safety = buildSupplierCompleteness(supplier);
    const duplicateWarnings = buildSupplierDuplicateWarnings(supplier, suppliersToEnrich);
    const riskBadges = buildSupplierRiskBadges(supplier, safety, duplicateWarnings);

    return {
      ...supplier,
      safety,
      duplicateWarnings,
      riskBadges,
      hasBankChangeHistory: Boolean((supplier.bankChangeCount ?? 0) > 0 || supplier.lastBankChangeAt),
      bankVerificationStatus: buildSupplierBankVerificationStatus(supplier),
    };
  });
}

export function buildSupplierChangedFields(
  before: Record<string, unknown>,
  updates: Partial<SupplierApUpdateInput>,
): SupplierChangedField[] {
  return (Object.keys(updates) as Array<keyof SupplierApUpdateInput>)
    .filter((field) => !valuesEqual(before[field as string], updates[field]))
    .map((field) => ({
      field,
      label: SUPPLIER_UPDATE_LABELS[field],
      before: before[field as string] ?? null,
      after: updates[field] ?? null,
    }));
}

export function splitSupplierChangedFields(changedFields: SupplierChangedField[]) {
  const bankFieldSet = new Set<string>(SUPPLIER_BANK_FIELD_KEYS);

  return {
    bankFields: changedFields.filter((field) => bankFieldSet.has(field.field)),
    statusFields: changedFields.filter((field) => field.field === "isActive"),
    masterFields: changedFields.filter(
      (field) => !bankFieldSet.has(field.field) && field.field !== "isActive",
    ),
  };
}

export function hasSupplierPaymentTermsChange(changedFields: SupplierChangedField[]) {
  return changedFields.some((field) => field.field === "paymentTermsDays");
}

export function buildSupplierApUpdateFields(input: SupplierApUpdateInput) {
  const setFields: Record<string, any> = {};

  if (input.name !== undefined) setFields.name = input.name;
  if (input.contactPerson !== undefined) setFields.contactPerson = input.contactPerson;
  if (input.contactPhone !== undefined) setFields.contactPhone = input.contactPhone;
  if (input.contactEmail !== undefined) setFields.contactEmail = input.contactEmail;
  if (input.address !== undefined) setFields.address = input.address;
  if (input.tin !== undefined) setFields.tin = input.tin;
  if (input.mnemonicCode !== undefined) setFields.mnemonicCode = input.mnemonicCode;
  if (input.paymentTermsDays !== undefined) setFields.paymentTermsDays = input.paymentTermsDays;
  if (input.creditLimit !== undefined) setFields.creditLimit = input.creditLimit;
  if (input.bankName !== undefined) setFields.bankName = input.bankName;
  if (input.bankAccountNumber !== undefined) setFields.bankAccountNumber = input.bankAccountNumber;
  if (input.bankAccountName !== undefined) setFields.bankAccountName = input.bankAccountName;
  if (input.notes !== undefined) setFields.notes = input.notes;
  if (input.isActive !== undefined) setFields.isActive = input.isActive;

  return setFields;
}

export function buildSupplierApCreateValues(orgId: string, input: SupplierApCreateInput) {
  if (!input.name?.trim()) throw new Error("Supplier name is required");

  return {
    orgId,
    name: input.name.trim(),
    contactPerson: input.contactPerson ?? null,
    contactPhone: input.contactPhone ?? null,
    contactEmail: input.contactEmail ?? null,
    address: input.address ?? null,
    tin: input.tin ?? null,
    mnemonicCode: input.mnemonicCode ?? null,
    paymentTermsDays: input.paymentTermsDays ?? 30,
    creditLimit: input.creditLimit ?? "0.00",
    bankName: input.bankName ?? null,
    bankAccountNumber: input.bankAccountNumber ?? null,
    bankAccountName: input.bankAccountName ?? null,
    notes: input.notes ?? null,
    isActive: true,
  };
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "number" || typeof right === "number") {
    return Number(left ?? 0) === Number(right ?? 0);
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) === Boolean(right);
  }
  return String(left ?? "").trim() === String(right ?? "").trim();
}
