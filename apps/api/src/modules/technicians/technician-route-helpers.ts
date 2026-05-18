export const TECHNICIAN_MANAGE_ROLES = ["ADMIN", "MANAGER"];

export function canManageTechnicians(role: string | undefined) {
  return !!role && TECHNICIAN_MANAGE_ROLES.includes(role);
}

export function getUserRole(request: { user?: unknown }) {
  return (request.user as any)?.role as string | undefined;
}

export function getTechnicianErrorStatus(err: { message?: string }) {
  return err.message?.includes("not found") ? 404 : 400;
}
