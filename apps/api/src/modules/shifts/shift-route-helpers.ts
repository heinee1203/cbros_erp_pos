import { SHIFT_FORCE_CLOSE_ROLES } from "@apex/types";

export type ShiftCloseBody = {
  actualCash: string;
  expectedCashAdjustment?: string;
  notes?: string;
};

export type ShiftForceCloseBody = {
  pin?: string;
  authorizationCredential?: string;
  authorizationMethod?: "pin" | "barcode" | "card";
};

export type ShiftDrawerEventBody = {
  type: "NO_SALE" | "PAID_IN" | "PAID_OUT";
  amount?: string | number | null;
  reason?: string | null;
  clientEventId?: string | null;
  authorizationCredential?: string | null;
  authorizationMethod?: "pin" | "barcode" | "card";
  drawerOpened?: boolean;
  drawerError?: string | null;
};

export const SHIFT_LOCATION_REQUIRED_ERROR =
  "A specific location must be selected for this operation";

export function canAccessAllShiftLocations(role: string) {
  return SHIFT_FORCE_CLOSE_ROLES.includes(role as any);
}

export function getShiftRouteErrorMessage(err: unknown) {
  return (err as { message: string }).message;
}

export function getForceCloseErrorStatus(message: string) {
  return message === "Invalid PIN" || message === "Invalid manager authorization" ? 401 : 400;
}

export function shouldListAllShiftLocations(
  allLocationsQuery: string | undefined,
  currentLocationId: string | null | undefined,
) {
  return allLocationsQuery === "true" || !currentLocationId;
}
