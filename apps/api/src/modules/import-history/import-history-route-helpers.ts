export const IMPORT_HISTORY_MANAGE_ROLES = ["ADMIN", "MANAGER"];

export type ImportHistoryPreviewBody = {
  csvText: string;
};

export function canManageImportHistory(role: string | undefined) {
  return IMPORT_HISTORY_MANAGE_ROLES.includes(role ?? "");
}

export function getImportHistoryErrorMessage(
  err: unknown,
  fallback: string,
) {
  return (err as { message?: string }).message || fallback;
}
