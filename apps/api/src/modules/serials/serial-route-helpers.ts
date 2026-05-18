import { UserRole } from "@apex/types";

export const SERIAL_ADMIN_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
];

export type SerialRouteQuery = Record<string, string | undefined>;

export type BulkRegisterSerialInput =
  | string
  | { serialNumber: string; dotCode?: string };

export type BulkRegisterSerialBody = {
  productId?: string;
  locationId?: string;
  serialNumbers?: BulkRegisterSerialInput[];
  serials?: { serialNumber: string; dotCode?: string }[];
};

export function isSerialAdminRole(role: unknown) {
  return SERIAL_ADMIN_ROLES.includes(role as UserRole);
}

export function parseSerialListLimit(query: SerialRouteQuery) {
  return Math.min(parseInt(query.limit ?? "50", 10), 200);
}

export function parseTireAgeReportLimit(query: SerialRouteQuery) {
  return query.limit ? parseInt(query.limit, 10) : undefined;
}

export function getBulkRegisterSerialInput(body: BulkRegisterSerialBody) {
  return body.serials ?? body.serialNumbers;
}

export function hasValidBulkRegisterSerialInput(
  body: BulkRegisterSerialBody,
  serialInput: BulkRegisterSerialInput[] | undefined,
) {
  return (
    !!body.productId &&
    !!body.locationId &&
    Array.isArray(serialInput) &&
    serialInput.length > 0
  );
}
