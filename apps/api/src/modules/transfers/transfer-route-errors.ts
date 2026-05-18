export const DUPLICATE_TRANSFER_REQUEST_ERROR =
  "Duplicate request (idempotency key already used)";

type TransferRouteError = {
  code?: string;
  message?: string;
};

export function isApproveTransferDuplicateRequest(err: TransferRouteError) {
  return (
    err.message?.includes("unique constraint") ||
    err.message?.includes("idempotency")
  );
}

export function isTransferWorkflowDuplicateRequest(err: TransferRouteError) {
  return (
    err.code === "23505" ||
    err.message?.includes("unique constraint") ||
    err.message?.includes("duplicate key") ||
    err.message?.includes("idempotency_key")
  );
}
