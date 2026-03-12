import { db } from "@apex/database";
import { organizations, users, locations } from "@apex/database/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

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

  const [org] = await db
    .insert(organizations)
    .values({ name: input.orgName, slug })
    .returning();

  const [defaultLocation] = await db
    .insert(locations)
    .values({
      orgId: org.id,
      name: `${input.orgName} Main Warehouse`,
      type: "WAREHOUSE",
    })
    .returning();

  const [user] = await db
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
}

/**
 * Verify a 4-digit PIN for a user with ADMIN or MANAGER role.
 * The requesting user provides the PIN — we check all admins/managers
 * in the same org for a matching PIN.
 */
export async function verifyPin(orgId: string, pin: string): Promise<boolean> {
  const managers = await db
    .select({ pinHash: users.pinHash })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        inArray(users.role, ["ADMIN", "MANAGER"]),
        isNotNull(users.pinHash),
      ),
    );

  for (const mgr of managers) {
    if (mgr.pinHash && (await bcrypt.compare(pin, mgr.pinHash))) {
      return true;
    }
  }
  return false;
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
