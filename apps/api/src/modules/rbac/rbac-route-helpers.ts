export function isAdminRole(role: string | undefined) {
  return role === "ADMIN";
}

export function getRbacErrorStatus(err: { statusCode?: number }) {
  return err.statusCode ?? 400;
}
