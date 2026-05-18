import type { GroupBy, MonthlyCompareMode } from "./analytics-read-service";

export const VALID_GROUP_BY = new Set<GroupBy>(["day", "week", "month", "quarter", "year"]);
export const VALID_COMPARE_MODES = new Set<MonthlyCompareMode>(["none", "mom", "yoy", "both"]);

export function assertAdmin(role: string) {
  if (role !== "ADMIN") {
    throw Object.assign(new Error("Admin role required for analytics endpoints"), {
      statusCode: 403,
    });
  }
}

/**
 * Parse and validate a YYYY-MM-DD date string. Returns null on bad input.
 * We keep this strict because the service SQL interpolates these directly.
 */
export function parseIsoDate(s: unknown): string | null {
  if (typeof s !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return s;
}

export function parseIsoMonth(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const year = Number(m[1]);
  if (year < 1900 || year > 9999) return null;
  return s;
}
