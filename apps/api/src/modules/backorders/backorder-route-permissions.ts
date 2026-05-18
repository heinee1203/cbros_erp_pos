const BACKORDER_ROLES = ["ADMIN", "MANAGER"];

export function assertBackorderRole(role: string) {
  if (!BACKORDER_ROLES.includes(role)) {
    throw new Error("Insufficient role for backorder operations");
  }
}
