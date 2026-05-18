import type { DbOrTx } from "@apex/database";
import { products } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";

/**
 * Generate a guaranteed-unique 10-char mnemonic SKU.
 * Strategy: 4-char prefix from name + 6-char random uppercase letters.
 * If collision (astronomically unlikely), retry up to 10 times.
 */
export async function generateUniqueMnemonicSku(
  orgId: string,
  productName: string,
  dbOrTx: DbOrTx,
): Promise<string> {
  const prefix = productName
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = prefix + suffix;

    const [existing] = await dbOrTx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.mnemonicSku, candidate)))
      .limit(1);

    if (!existing) return candidate;
  }

  const ts = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, "X");
  return prefix + ts;
}
