/**
 * DOT Date Code Parser for Tires
 *
 * DOT codes are 4-digit WWYY format stamped on tire sidewalls:
 *   "1724" = Week 17, Year 2024 (late April 2024)
 *   "3520" = Week 35, Year 2020 (late August 2020)
 *
 * Age thresholds:
 *   < 60 months (5 years): OK
 *   60-72 months: WARNING — tire is aging
 *   > 72 months (6 years): EXPIRED — unsafe, should not be sold
 */

export const DOT_WARNING_MONTHS = 60; // 5 years
export const DOT_BLOCK_MONTHS = 72; // 6 years

export interface DotParseResult {
  valid: boolean;
  week?: number;
  year?: number;
  manufactureDate?: string; // ISO date string YYYY-MM-DD
  ageMonths?: number;
  warning?: string;
}

/**
 * Parse a 4-digit DOT date code and calculate tire age.
 */
export function parseDotCode(code: string): DotParseResult {
  if (!code || !/^\d{4}$/.test(code)) {
    return { valid: false, warning: "DOT code must be exactly 4 digits" };
  }

  const week = parseInt(code.substring(0, 2), 10);
  const yearShort = parseInt(code.substring(2, 4), 10);

  if (week < 1 || week > 52) {
    return { valid: false, warning: `Invalid week: ${week}. Must be 01-52.` };
  }

  // Convert 2-digit year to 4-digit (all tires in inventory are 2000+)
  const year = 2000 + yearShort;

  // Reasonable year range: 2010 to current year + 1
  const currentYear = new Date().getFullYear();
  if (year < 2010 || year > currentYear + 1) {
    return { valid: false, warning: `Unlikely manufacture year: ${year}` };
  }

  // Calculate approximate manufacture date (Monday of that week)
  // ISO week date: Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Mon=1..Sun=7
  const monday1 = new Date(jan4);
  monday1.setDate(jan4.getDate() - dayOfWeek + 1); // Monday of week 1
  const manufactureDate = new Date(monday1);
  manufactureDate.setDate(monday1.getDate() + (week - 1) * 7);

  // Calculate age in months
  const now = new Date();
  const ageMonths = Math.max(
    0,
    (now.getFullYear() - manufactureDate.getFullYear()) * 12 +
      (now.getMonth() - manufactureDate.getMonth()),
  );

  const dateStr = manufactureDate.toISOString().split("T")[0];

  let warning: string | undefined;
  if (ageMonths >= DOT_BLOCK_MONTHS) {
    warning = `Tire is ${(ageMonths / 12).toFixed(1)} years old — exceeds 6-year safety limit. Should NOT be sold.`;
  } else if (ageMonths >= DOT_WARNING_MONTHS) {
    warning = `Tire is ${(ageMonths / 12).toFixed(1)} years old — exceeds 5-year recommended limit.`;
  }

  return {
    valid: true,
    week,
    year,
    manufactureDate: dateStr,
    ageMonths,
    warning,
  };
}

/**
 * Get age status classification for a tire.
 */
export function getDotAgeStatus(ageMonths: number): "ok" | "warning" | "expired" {
  if (ageMonths >= DOT_BLOCK_MONTHS) return "expired";
  if (ageMonths >= DOT_WARNING_MONTHS) return "warning";
  return "ok";
}

/**
 * Format age in months as human-readable string.
 */
export function formatTireAge(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (years === 0) return `${months} month${months !== 1 ? "s" : ""}`;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""}`;
  return `${years}.${Math.round((months / 12) * 10)} years`;
}
