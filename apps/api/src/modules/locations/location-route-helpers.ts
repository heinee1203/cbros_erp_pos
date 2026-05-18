export const LOCATION_MANAGE_ROLES = ["ADMIN", "MANAGER"];

export type LocationRouteUser = {
  orgId: string;
  role?: string;
};

export type LocationListQuery = {
  includeInactive?: string;
};

export function canManageLocations(
  user: LocationRouteUser | null | undefined,
): user is LocationRouteUser {
  return !!user && LOCATION_MANAGE_ROLES.includes(user.role ?? "");
}

export function shouldIncludeInactiveLocations(query: LocationListQuery) {
  return query.includeInactive === "true";
}
