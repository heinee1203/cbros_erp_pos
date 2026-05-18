export function isIdempotencyError(err: Error): boolean {
  return (
    err.message.includes("duplicate key") ||
    err.message.includes("already exists") ||
    err.message.includes("idempotency")
  );
}

export function isContentionError(err: Error): boolean {
  return (
    err.message.includes("could not obtain lock") ||
    err.message.includes("deadlock") ||
    err.message.includes("Row is locked")
  );
}
