import { db } from "@apex/database";
import { organizations, users, locations } from "@apex/database/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const AUTHORIZATION_ROLES = ["ADMIN", "MANAGER"] as const;
const AUTHORIZATION_CREDENTIAL_LABEL_PATTERN = /(?:PIN|AUTH|APEXAUTH|APEX-MGR|MGR|MANAGER|APEXMANAGER)/i;

export async function createOrganizationWithAdmin(input: {
  orgName: string;
  email: string;
  password: string;
  fullName: string;
}) {
  const slug = input.orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingUser) {
    throw new Error("Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.orgName, slug })
      .returning();

    const [defaultLocation] = await tx
      .insert(locations)
      .values({
        orgId: org.id,
        name: `${input.orgName} Main Warehouse`,
        type: "WAREHOUSE",
        code: "WH01",
      })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        orgId: org.id,
        primaryLocationId: defaultLocation.id,
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        role: "ADMIN",
      })
      .returning();

    return { org, user, defaultLocation };
  });
}

/**
 * Verify a 4-digit PIN for a user with ADMIN or MANAGER role.
 * The requesting user provides the PIN — we check all admins/managers
 * in the same org for a matching PIN.
 */
export async function verifyPin(
  orgId: string,
  pin: string,
): Promise<{ valid: boolean; userId: string | null; fullName?: string; role?: string }> {
  const managers = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      role: users.role,
      pinHash: users.pinHash,
    })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        inArray(users.role, AUTHORIZATION_ROLES),
        isNotNull(users.pinHash),
      ),
    );

  for (const mgr of managers) {
    if (mgr.pinHash && (await bcrypt.compare(pin, mgr.pinHash))) {
      return {
        valid: true,
        userId: mgr.id,
        fullName: mgr.fullName,
        role: mgr.role,
      };
    }
  }
  return { valid: false, userId: null };
}

export function extractAuthorizationPin(credential: string): string | null {
  const normalized = credential.trim().replace(/\0/g, "").replace(/[\r\n\t]/g, "");
  if (/^\d{4}$/.test(normalized)) return normalized;

  const jsonPin = extractJsonAuthorizationPin(normalized);
  if (jsonPin) return jsonPin;

  const urlPin = extractUrlAuthorizationPin(normalized);
  if (urlPin) return urlPin;

  const labeled = normalized.match(
    /(?:PIN|AUTH|APEXAUTH|APEX-MGR|MGR|MANAGER)[\s:/|=+#-]*(\d{4})(?!\d)/i,
  );
  if (labeled) return labeled[1];

  if (/^[%;]/.test(normalized) && !AUTHORIZATION_CREDENTIAL_LABEL_PATTERN.test(normalized)) {
    return null;
  }

  const trackAccount = normalized.match(/^[%;]B?(\d{4})(?:[=^?;]|$)/i);
  if (trackAccount) return trackAccount[1];

  const trackData = normalized.match(/[=^](\d{4})(?:[?;]|$)/);
  if (trackData) return trackData[1];

  return null;
}

function extractJsonAuthorizationPin(credential: string): string | null {
  if (!credential.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(credential) as Record<string, unknown>;
    const pin = parsed.pin ?? parsed.auth ?? parsed.authorizationPin ?? parsed.managerPin;
    return typeof pin === "string" && /^\d{4}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
}

function extractUrlAuthorizationPin(credential: string): string | null {
  if (!credential.includes("?")) return null;
  try {
    const url = new URL(credential);
    const pin = url.searchParams.get("pin")
      ?? url.searchParams.get("auth")
      ?? url.searchParams.get("code")
      ?? url.searchParams.get("managerPin");
    return pin && /^\d{4}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
}

/**
 * Verify a scanned/swiped manager credential.
 *
 * Current supported manager badge/card payloads encode the same 4-digit
 * manager secret used by PIN authorization. Accepted formats include:
 * - 1234
 * - PIN:1234
 * - APEXAUTH1234
 * - APEX-MGR:1234
 * - magstripe-like track data containing =1234? or ^1234?
 */
export async function verifyAuthorizationCredential(
  orgId: string,
  credential: string,
): Promise<{ valid: boolean; userId: string | null; fullName?: string; role?: string }> {
  const pin = extractAuthorizationPin(credential);
  if (!pin) return { valid: false, userId: null };
  return verifyPin(orgId, pin);
}

export async function setAuthorizationPin(input: {
  orgId: string;
  userId: string;
  pin: string;
}): Promise<{ success: boolean; fullName?: string; role?: string }> {
  const pinHash = await bcrypt.hash(input.pin, SALT_ROUNDS);
  const [updated] = await db
    .update(users)
    .set({ pinHash })
    .where(
      and(
        eq(users.id, input.userId),
        eq(users.orgId, input.orgId),
        inArray(users.role, AUTHORIZATION_ROLES),
      ),
    )
    .returning({
      fullName: users.fullName,
      role: users.role,
    });

  if (!updated) return { success: false };
  return {
    success: true,
    fullName: updated.fullName,
    role: updated.role,
  };
}

export async function authenticateUser(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  return user;
}
