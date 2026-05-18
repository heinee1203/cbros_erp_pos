export const DUPLICATE_SALE_REQUEST_ERROR =
  "Duplicate request (idempotency key already used)";

type SaleRouteError = {
  code?: string;
  message?: string;
};

export function isDuplicateSaleRequest(err: SaleRouteError) {
  return (
    err.code === "23505" ||
    err.message?.includes("unique constraint") ||
    err.message?.includes("idempotency")
  );
}
