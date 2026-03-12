/**
 * Shared mutation infrastructure for enterprise operations.
 *
 * Used by: use-sale-mutations, use-po-mutations, use-transfer-mutations,
 * use-job-card-mutations, use-adjustment-mutation.
 *
 * Handles: idempotency keys, 409 (already-processed), 423 (contention retry),
 * 5xx (needs reconciliation), 4xx (business logic errors).
 */
import { ApiError } from "./query-provider";

export const MAX_CONTENTION_RETRIES = 3;
export const CONTENTION_RETRY_DELAY_MS = 1_000;

export type MutationStatus =
  | "idle"
  | "submitting"
  | "contention_retry"
  | "already_processed"
  | "needs_reconcile"
  | "success"
  | "error";

export function getStatusMessage(status: MutationStatus): string {
  switch (status) {
    case "submitting":
      return "Submitting\u2026";
    case "contention_retry":
      return "Retrying (row locked)\u2026";
    case "already_processed":
      return "Already processed";
    case "needs_reconcile":
      return "Unknown state \u2014 needs manual check";
    case "success":
      return "Success";
    case "error":
      return "Error";
    default:
      return "";
  }
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function classifyMutationError(err: unknown): MutationStatus {
  if (err instanceof ApiError) {
    if (err.status === 409) return "already_processed";
    if (err.status >= 500 || err.status === 0) return "needs_reconcile";
  }
  return "error";
}

/**
 * Retry a function on 423 (row contention) up to maxRetries times.
 */
export async function withContentionRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_CONTENTION_RETRIES,
  delay: number = CONTENTION_RETRY_DELAY_MS
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 423 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max contention retries exceeded");
}
