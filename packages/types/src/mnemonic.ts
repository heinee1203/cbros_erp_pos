/**
 * Mnemonic Cost Code Generator
 *
 * Converts a numeric cost price into a variable-length cipher
 * using the KINGSCOBRA alphabet.
 *
 * Cipher: A=0, K=1, I=2, N=3, G=4, S=5, C=6, O=7, B=8, R=9
 *
 * Algorithm:
 *   1. Round cost to integer pesos (no centavos)
 *   2. Map each digit to its cipher letter (no zero-padding)
 *
 * Example: 1200 → "1200" → "KIAA"
 *          3152.50 → 3153 → "NKSN"
 */

const COST_CIPHER = "AKINGSCOBR";
//                    0123456789
// A=0, K=1, I=2, N=3, G=4, S=5, C=6, O=7, B=8, R=9

/**
 * Generate a variable-length mnemonic cost code from a cost price.
 *
 * @param costPrice - Cost price as a numeric string (e.g. "1200") or number
 * @returns Variable-length uppercase mnemonic cost code (integer pesos only)
 */
export function generateCostCode(costPrice: string | number): string {
  const price = typeof costPrice === "string" ? parseFloat(costPrice) : costPrice;

  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid cost price: ${costPrice}`);
  }

  // Round to integer pesos — no centavos
  const pesos = Math.round(price);

  // Convert each digit to its cipher letter (no zero-padding)
  const digits = String(pesos);
  let code = "";
  for (let i = 0; i < digits.length; i++) {
    const digit = parseInt(digits[i], 10);
    code += COST_CIPHER[digit];
  }

  return code;
}
