import { sql } from "drizzle-orm";

export const IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION = "item-import-field-scope-v1";
export const IMPORT_PROFILE_IMPORT_TYPES = ["items"] as const;
export const IMPORT_PROFILE_MODES = [
  "smart_sync",
  "create_only",
  "update_only",
  "inventory_sync",
] as const;

export type ImportProfileImportType = (typeof IMPORT_PROFILE_IMPORT_TYPES)[number];
export type ImportProfileMode = (typeof IMPORT_PROFILE_MODES)[number];

export type ImportProfileCategoryMapping = Record<
  string,
  {
    action: "create" | "map" | "skip";
    targetCategoryId?: string;
    targetSubcategoryId?: string;
    familyId?: string;
    createSubcategory?: boolean;
  }
>;

export interface ImportProfileInput {
  name?: unknown;
  importType?: unknown;
  importMode?: unknown;
  locationMapping?: unknown;
  categoryMapping?: unknown;
  includeCreates?: unknown;
  includeUpdates?: unknown;
  includeNoChange?: unknown;
  createNewCategories?: unknown;
  fieldLockPolicyVersion?: unknown;
}

export interface NormalizedImportProfileInput {
  name?: string;
  importType?: ImportProfileImportType;
  importMode?: ImportProfileMode;
  locationMapping?: Record<string, string>;
  categoryMapping?: ImportProfileCategoryMapping;
  includeCreates?: boolean;
  includeUpdates?: boolean;
  includeNoChange?: boolean;
  createNewCategories?: boolean;
  fieldLockPolicyVersion?: string;
}

export interface ImportProfileRecord {
  id: string;
  orgId: string;
  name: string;
  importType: ImportProfileImportType;
  importMode: ImportProfileMode;
  locationMapping: Record<string, string>;
  categoryMapping: ImportProfileCategoryMapping;
  includeCreates: boolean;
  includeUpdates: boolean;
  includeNoChange: boolean;
  createNewCategories: boolean;
  fieldLockPolicyVersion: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ImportProfileDbRow {
  id: string;
  org_id: string;
  name: string;
  import_type: string;
  import_mode: string;
  location_mapping: unknown;
  category_mapping: unknown;
  include_creates: boolean;
  include_updates: boolean;
  include_no_change: boolean;
  create_new_categories: boolean;
  field_lock_policy_version: string;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_SELECT = sql`
  id,
  org_id,
  name,
  import_type,
  import_mode,
  location_mapping,
  category_mapping,
  include_creates,
  include_updates,
  include_no_change,
  create_new_categories,
  field_lock_policy_version,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
`;

async function getDatabase() {
  const { db } = await import("@apex/database");
  return db;
}

export function isImportProfileMode(value: unknown): value is ImportProfileMode {
  return typeof value === "string" && IMPORT_PROFILE_MODES.includes(value as ImportProfileMode);
}

export function isImportProfileImportType(value: unknown): value is ImportProfileImportType {
  return (
    typeof value === "string" &&
    IMPORT_PROFILE_IMPORT_TYPES.includes(value as ImportProfileImportType)
  );
}

export function sanitizeImportProfileName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Profile name is required");
  }

  const name = value.trim();
  if (!name) {
    throw new Error("Profile name is required");
  }

  if (name.length > 120) {
    throw new Error("Profile name must be 120 characters or less");
  }

  return name;
}

export function sanitizeStringMapping(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};

  const mapping: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof key !== "string" || typeof rawValue !== "string") continue;
    const csvName = key.trim();
    const targetId = rawValue.trim();
    if (!csvName || !targetId) continue;
    mapping[csvName] = targetId;
  }
  return mapping;
}

export function sanitizeCategoryMapping(value: unknown): ImportProfileCategoryMapping {
  if (!isPlainObject(value)) return {};

  const mapping: ImportProfileCategoryMapping = {};
  for (const [csvName, rawChoice] of Object.entries(value)) {
    if (!csvName.trim() || !isPlainObject(rawChoice)) continue;
    const action = rawChoice.action;
    if (action !== "create" && action !== "map" && action !== "skip") continue;

    const choice: ImportProfileCategoryMapping[string] = { action };
    copyString(rawChoice.targetCategoryId, "targetCategoryId", choice);
    copyString(rawChoice.targetSubcategoryId, "targetSubcategoryId", choice);
    copyString(rawChoice.familyId, "familyId", choice);
    if (typeof rawChoice.createSubcategory === "boolean") {
      choice.createSubcategory = rawChoice.createSubcategory;
    }

    mapping[csvName.trim()] = choice;
  }
  return mapping;
}

export function normalizeImportProfileInput(
  input: ImportProfileInput,
  options: { partial?: boolean } = {},
): NormalizedImportProfileInput {
  const partial = options.partial === true;
  const normalized: NormalizedImportProfileInput = {};

  if (!partial || input.name !== undefined) {
    normalized.name = sanitizeImportProfileName(input.name);
  }

  if (!partial || input.importType !== undefined) {
    if (input.importType === undefined) {
      normalized.importType = "items";
    } else if (isImportProfileImportType(input.importType)) {
      normalized.importType = input.importType;
    } else {
      throw new Error("Unsupported import profile type");
    }
  }

  if (!partial || input.importMode !== undefined) {
    if (input.importMode === undefined) {
      normalized.importMode = "create_only";
    } else if (isImportProfileMode(input.importMode)) {
      normalized.importMode = input.importMode;
    } else {
      throw new Error("Unsupported import mode");
    }
  }

  if (!partial || input.locationMapping !== undefined) {
    normalized.locationMapping = sanitizeStringMapping(input.locationMapping);
  }

  if (!partial || input.categoryMapping !== undefined) {
    normalized.categoryMapping = sanitizeCategoryMapping(input.categoryMapping);
  }

  if (!partial || input.includeCreates !== undefined) {
    normalized.includeCreates = boolOrDefault(input.includeCreates, true);
  }

  if (!partial || input.includeUpdates !== undefined) {
    normalized.includeUpdates = boolOrDefault(input.includeUpdates, true);
  }

  if (!partial || input.includeNoChange !== undefined) {
    normalized.includeNoChange = boolOrDefault(input.includeNoChange, false);
  }

  if (!partial || input.createNewCategories !== undefined) {
    normalized.createNewCategories = boolOrDefault(input.createNewCategories, true);
  }

  if (!partial || input.fieldLockPolicyVersion !== undefined) {
    normalized.fieldLockPolicyVersion =
      typeof input.fieldLockPolicyVersion === "string" &&
      input.fieldLockPolicyVersion.trim()
        ? input.fieldLockPolicyVersion.trim().slice(0, 80)
        : IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION;
  }

  return normalized;
}

export async function listImportProfiles(
  orgId: string,
  importType: unknown = "items",
): Promise<ImportProfileRecord[]> {
  const normalizedImportType = isImportProfileImportType(importType) ? importType : "items";
  const db = await getDatabase();
  const rows = await db.execute(
    sql`SELECT ${PROFILE_SELECT}
        FROM import_profiles
        WHERE org_id = ${orgId} AND import_type = ${normalizedImportType}
        ORDER BY updated_at DESC, name ASC`,
  );

  return Array.from(rows as Iterable<ImportProfileDbRow>).map(normalizeImportProfileRow);
}

export async function createImportProfile(
  orgId: string,
  userId: string | null | undefined,
  input: ImportProfileInput,
): Promise<ImportProfileRecord> {
  const normalized = normalizeImportProfileInput(input);
  const db = await getDatabase();
  const rows = await db.execute(
    sql`INSERT INTO import_profiles (
          org_id,
          name,
          import_type,
          import_mode,
          location_mapping,
          category_mapping,
          include_creates,
          include_updates,
          include_no_change,
          create_new_categories,
          field_lock_policy_version,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          ${orgId},
          ${normalized.name!},
          ${normalized.importType!},
          ${normalized.importMode!},
          ${JSON.stringify(normalized.locationMapping ?? {})}::jsonb,
          ${JSON.stringify(normalized.categoryMapping ?? {})}::jsonb,
          ${normalized.includeCreates!},
          ${normalized.includeUpdates!},
          ${normalized.includeNoChange!},
          ${normalized.createNewCategories!},
          ${normalized.fieldLockPolicyVersion!},
          ${coerceUuid(userId)},
          ${coerceUuid(userId)}
        )
        RETURNING ${PROFILE_SELECT}`,
  );

  const [row] = Array.from(rows as Iterable<ImportProfileDbRow>);
  if (!row) {
    throw new Error("Failed to create import profile");
  }
  return normalizeImportProfileRow(row);
}

export async function updateImportProfile(
  orgId: string,
  userId: string | null | undefined,
  profileId: string,
  input: ImportProfileInput,
): Promise<ImportProfileRecord | null> {
  const current = await getImportProfileById(orgId, profileId);
  if (!current) return null;

  const normalized = normalizeImportProfileInput(input, { partial: true });
  const next = {
    name: normalized.name ?? current.name,
    importType: normalized.importType ?? current.importType,
    importMode: normalized.importMode ?? current.importMode,
    locationMapping: normalized.locationMapping ?? current.locationMapping,
    categoryMapping: normalized.categoryMapping ?? current.categoryMapping,
    includeCreates: normalized.includeCreates ?? current.includeCreates,
    includeUpdates: normalized.includeUpdates ?? current.includeUpdates,
    includeNoChange: normalized.includeNoChange ?? current.includeNoChange,
    createNewCategories: normalized.createNewCategories ?? current.createNewCategories,
    fieldLockPolicyVersion:
      normalized.fieldLockPolicyVersion ?? current.fieldLockPolicyVersion,
  };

  const db = await getDatabase();
  const rows = await db.execute(
    sql`UPDATE import_profiles
        SET name = ${next.name},
            import_type = ${next.importType},
            import_mode = ${next.importMode},
            location_mapping = ${JSON.stringify(next.locationMapping)}::jsonb,
            category_mapping = ${JSON.stringify(next.categoryMapping)}::jsonb,
            include_creates = ${next.includeCreates},
            include_updates = ${next.includeUpdates},
            include_no_change = ${next.includeNoChange},
            create_new_categories = ${next.createNewCategories},
            field_lock_policy_version = ${next.fieldLockPolicyVersion},
            updated_by_user_id = ${coerceUuid(userId)},
            updated_at = NOW()
        WHERE org_id = ${orgId} AND id = ${profileId}
        RETURNING ${PROFILE_SELECT}`,
  );

  const [row] = Array.from(rows as Iterable<ImportProfileDbRow>);
  return row ? normalizeImportProfileRow(row) : null;
}

export async function deleteImportProfile(
  orgId: string,
  profileId: string,
): Promise<boolean> {
  if (!UUID_RE.test(profileId)) return false;

  const db = await getDatabase();
  const rows = await db.execute(
    sql`DELETE FROM import_profiles
        WHERE org_id = ${orgId} AND id = ${profileId}
        RETURNING id`,
  );

  return Array.from(rows as Iterable<{ id: string }>).length > 0;
}

export function normalizeImportProfileRow(row: ImportProfileDbRow): ImportProfileRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    importType: isImportProfileImportType(row.import_type) ? row.import_type : "items",
    importMode: isImportProfileMode(row.import_mode) ? row.import_mode : "create_only",
    locationMapping: sanitizeStringMapping(parseJsonColumn(row.location_mapping)),
    categoryMapping: sanitizeCategoryMapping(parseJsonColumn(row.category_mapping)),
    includeCreates: Boolean(row.include_creates),
    includeUpdates: Boolean(row.include_updates),
    includeNoChange: Boolean(row.include_no_change),
    createNewCategories: Boolean(row.create_new_categories),
    fieldLockPolicyVersion:
      row.field_lock_policy_version || IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getImportProfileById(
  orgId: string,
  profileId: string,
): Promise<ImportProfileRecord | null> {
  if (!UUID_RE.test(profileId)) return null;

  const db = await getDatabase();
  const rows = await db.execute(
    sql`SELECT ${PROFILE_SELECT}
        FROM import_profiles
        WHERE org_id = ${orgId} AND id = ${profileId}
        LIMIT 1`,
  );

  const [row] = Array.from(rows as Iterable<ImportProfileDbRow>);
  return row ? normalizeImportProfileRow(row) : null;
}

function boolOrDefault(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function coerceUuid(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function copyString(
  value: unknown,
  key: "targetCategoryId" | "targetSubcategoryId" | "familyId",
  target: ImportProfileCategoryMapping[string],
) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) {
    target[key] = trimmed;
  }
}

function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
