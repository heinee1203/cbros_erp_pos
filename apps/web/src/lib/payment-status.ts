/**
 * Unified post-SOA payment-stage vocabulary.
 *
 * Used by the Supplier SOA History view and the DV Detail Modal so the same
 * underlying state (e.g. a DV that's been printed but not yet confirmed) is
 * labelled identically everywhere a business user sees it.
 *
 * Not used by the DV List page / dv-table.tsx — that view intentionally keeps
 * the raw DV lifecycle labels (DRAFT / PRINTED / CONFIRMED / VOIDED) because
 * the operator distinction between DRAFT and PRINTED is meaningful there.
 */

export type UnifiedPaymentStatus =
  | "BILLED"               // SOA generated, no DV yet
  | "PENDING_CONFIRMATION" // DV DRAFT or PRINTED
  | "PAID"                 // DV CONFIRMED
  | "VOIDED"               // SOA voided or DV voided
  | "PARTIAL_NO_DV";       // legacy: paidAmount > 0, no active DV

export const STATUS_LABELS: Record<UnifiedPaymentStatus, string> = {
  BILLED: "BILLED",
  PENDING_CONFIRMATION: "PENDING CONFIRMATION",
  PAID: "PAID",
  VOIDED: "VOIDED",
  PARTIAL_NO_DV: "⚠ PARTIAL (NO DV)",
};

export const STATUS_BADGE_CLASS: Record<UnifiedPaymentStatus, string> = {
  BILLED:               "border border-blue-200 bg-blue-100 text-blue-700",
  PENDING_CONFIRMATION: "border border-amber-200 bg-amber-100 text-amber-700",
  PAID:                 "border border-emerald-200 bg-emerald-100 text-emerald-700",
  VOIDED:               "bg-gray-200 text-gray-700",
  PARTIAL_NO_DV:        "border border-amber-300 bg-amber-100 text-amber-800",
};

/**
 * Raw DV.status → unified payment stage.
 *
 * The DV Detail Modal has only a DV record (not a SOA row), so it can't
 * distinguish BILLED vs PARTIAL_NO_DV — those are SOA-level states. The SOA
 * History page's resolveStatus delegates to this helper for the DV branch and
 * adds SOA-level logic on top.
 */
export function dvStatusToUnified(
  dvStatus: string | null | undefined,
): UnifiedPaymentStatus {
  switch (dvStatus) {
    case "CONFIRMED":
      return "PAID";
    case "PRINTED":
    case "DRAFT":
      return "PENDING_CONFIRMATION";
    case "VOIDED":
      return "VOIDED";
    default:
      // A DV should always have one of the above. Defensive fallback.
      return "BILLED";
  }
}
