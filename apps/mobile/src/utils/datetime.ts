export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  const postgresTimestamp = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?$/,
  );
  const normalized = postgresTimestamp
    ? `${postgresTimestamp[1]}T${postgresTimestamp[2]}${
      postgresTimestamp[3] === '+00' && !postgresTimestamp[4]
        ? 'Z'
        : `${postgresTimestamp[3]}:${postgresTimestamp[4] ?? '00'}`
    }`
    : trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');

  const parsed = new Date(normalized);
  if (Number.isFinite(parsed.getTime())) return parsed;

  const fallback = new Date(trimmed);
  return Number.isFinite(fallback.getTime()) ? fallback : null;
}

export function formatApiDateTime(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = '-',
): string {
  const parsed = parseApiDate(value);
  return parsed ? parsed.toLocaleString('en-PH', options) : fallback;
}
