export type FieldErrorMap = Record<string, string[]>;

export interface NormalizedFieldErrors {
  message: string;
  fieldErrors: FieldErrorMap;
  formErrors: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asMessage(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeFieldName(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join(".");
  return null;
}

function pushFieldError(
  fieldErrors: FieldErrorMap,
  rawField: unknown,
  rawMessage: unknown,
  aliases: Record<string, string>,
) {
  const field = normalizeFieldName(rawField);
  const message = asMessage(rawMessage);
  if (!field || !message) return;

  const key = aliases[field] ?? field;
  fieldErrors[key] = [...(fieldErrors[key] ?? []), message];
}

function collectFlattenedFieldErrors(
  fieldErrors: FieldErrorMap,
  candidate: unknown,
  aliases: Record<string, string>,
) {
  const flattened = asRecord(candidate);
  if (!flattened) return;

  for (const [field, messages] of Object.entries(flattened)) {
    if (Array.isArray(messages)) {
      for (const message of messages) pushFieldError(fieldErrors, field, message, aliases);
    } else {
      pushFieldError(fieldErrors, field, messages, aliases);
    }
  }
}

function collectErrorArray(
  fieldErrors: FieldErrorMap,
  candidate: unknown,
  aliases: Record<string, string>,
) {
  if (!Array.isArray(candidate)) return;

  for (const entry of candidate) {
    const record = asRecord(entry);
    if (!record) continue;
    pushFieldError(
      fieldErrors,
      record.field ?? record.path ?? record.name,
      record.message ?? record.error,
      aliases,
    );
  }
}

function collectFormErrors(candidate: unknown) {
  if (!Array.isArray(candidate)) return [];
  return candidate.map(asMessage).filter((message): message is string => Boolean(message));
}

export function normalizeFieldErrors(
  error: unknown,
  aliases: Record<string, string> = {},
  fallback = "Something went wrong. Please check the form and try again.",
): NormalizedFieldErrors {
  const errorRecord = asRecord(error);
  const body = asRecord(errorRecord?.body);
  const details = asRecord(body?.details);
  const fieldErrors: FieldErrorMap = {};

  collectFlattenedFieldErrors(fieldErrors, details?.fieldErrors, aliases);
  collectFlattenedFieldErrors(fieldErrors, body?.fieldErrors, aliases);
  collectErrorArray(fieldErrors, details?.errors, aliases);
  collectErrorArray(fieldErrors, body?.errors, aliases);

  const formErrors = [
    ...collectFormErrors(details?.formErrors),
    ...collectFormErrors(body?.formErrors),
  ];

  const message =
    formErrors[0] ??
    asMessage(body?.error) ??
    asMessage(errorRecord?.message) ??
    fallback;

  return {
    message: Object.keys(fieldErrors).length > 0 ? "Please fix the highlighted fields." : message,
    fieldErrors,
    formErrors,
  };
}

export function firstFieldError(fieldErrors: FieldErrorMap, field: string) {
  return fieldErrors[field]?.[0] ?? null;
}

export function hasFieldErrors(fieldErrors: FieldErrorMap) {
  return Object.keys(fieldErrors).length > 0;
}
