import { loginSchema, registerSchema } from "@apex/types";

type AuthTokenUser = {
  id: string;
  orgId: string;
  role: string;
  primaryLocationId?: string | null;
};

type AuthResponseUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
};

export function isPublicRegistrationEnabled() {
  return process.env.ENABLE_PUBLIC_REGISTRATION === "true";
}

export function parseRegisterRequest(body: unknown) {
  return registerSchema.safeParse(body);
}

export function parseLoginRequest(body: unknown) {
  return loginSchema.safeParse(body);
}

export function isDuplicateEmailError(error: unknown): error is Error {
  return error instanceof Error && error.message === "Email already registered";
}

export function isValidPin(pin: string | undefined): pin is string {
  return Boolean(pin && pin.length === 4 && /^\d{4}$/.test(pin));
}

export function normalizeAuthorizationCredential(credential: string | undefined) {
  const trimmed = credential?.trim();
  return trimmed && trimmed.length <= 255 ? trimmed : null;
}

export function buildAuthTokenPayload(
  user: AuthTokenUser,
  permissions: string[],
) {
  return {
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    primaryLocationId: user.primaryLocationId ?? "",
    permissions,
  };
}

export function buildAuthUserResponse(
  user: AuthResponseUser,
  permissions: string[],
) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    permissions,
  };
}

export function buildOrganizationResponse(org: AuthOrganization) {
  return { id: org.id, name: org.name, slug: org.slug };
}
