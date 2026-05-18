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
};

export type SupplierApDetailRow = Omit<
  SupplierApStatsRow,
  "open_count" | "total_payable" | "overdue_count" | "overdue_amount" | "oldest_overdue_date"
> & {
  avg_lead_time_days: number | null;
};

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
  };
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
