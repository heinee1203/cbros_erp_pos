/**
 * Barcode Utilities
 *
 * Pure functions for generating, validating, and computing check digits
 * for EAN-13 and UPC-A barcodes. Uses GS1 prefix "200" for in-store/internal use.
 */

/**
 * Compute the check digit (13th digit) for an EAN-13 barcode.
 *
 * Algorithm: Alternating weights of 1 and 3 on the first 12 digits,
 * sum them, check digit = (10 - (sum % 10)) % 10.
 */
export function computeEan13CheckDigit(first12: string): string {
  if (first12.length !== 12 || !/^\d{12}$/.test(first12)) {
    throw new Error("Input must be exactly 12 digits");
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12[i], 10);
    // Positions 0,2,4,… get weight 1; positions 1,3,5,… get weight 3
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return String(checkDigit);
}

/**
 * Validate a complete 13-digit EAN-13 barcode.
 *
 * Checks: exactly 13 digits, all numeric, valid check digit.
 */
export function isValidEan13(code: string): boolean {
  if (code.length !== 13 || !/^\d{13}$/.test(code)) {
    return false;
  }

  const first12 = code.slice(0, 12);
  const expectedCheck = computeEan13CheckDigit(first12);
  return code[12] === expectedCheck;
}

/**
 * Validate a complete 12-digit UPC-A barcode.
 *
 * UPC-A uses the same check digit algorithm as EAN-13 but with 11 data digits + 1 check digit.
 * The weight pattern is: odd positions (1-indexed) get weight 3, even get weight 1.
 */
export function isValidUpcA(code: string): boolean {
  if (code.length !== 12 || !/^\d{12}$/.test(code)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(code[i], 10);
    // UPC-A: odd positions (0,2,4,...) get weight 3, even (1,3,5,...) get weight 1
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return parseInt(code[11], 10) === checkDigit;
}

/**
 * Validate a barcode in any supported format (EAN-13, UPC-A, or any numeric string).
 *
 * For known formats (12 or 13 digits) it verifies the check digit.
 * For other lengths, it accepts any non-empty alphanumeric string (up to 50 chars).
 */
export function isValidBarcode(code: string): boolean {
  // Accept any non-empty string up to 50 chars.
  // No check-digit enforcement — users may have UPC, EAN-8, EAN-13,
  // custom codes, or manufacturer part numbers as barcodes.
  return !!code && code.length <= 50;
}

/**
 * Detect the JsBarcode format string for a given barcode.
 */
export function detectBarcodeFormat(code: string): string {
  if (/^\d{13}$/.test(code)) return "EAN13";
  if (/^\d{12}$/.test(code)) return "UPC";
  if (/^\d{8}$/.test(code)) return "EAN8";
  return "CODE128"; // fallback for arbitrary strings
}

/**
 * Generate a random EAN-13 barcode with GS1 prefix "200" (in-store use).
 *
 * Format: 200 + 9 random digits + 1 check digit = 13 digits total.
 *
 * This function is retry-safe: the caller should check DB uniqueness
 * and call again if there's a collision (extremely unlikely with 10^9 range).
 */
export function generateEan13(): string {
  // Prefix "200" = GS1 reserved for in-store/internal use
  const prefix = "200";

  // 9 random digits (0-9)
  let body = "";
  for (let i = 0; i < 9; i++) {
    body += Math.floor(Math.random() * 10).toString();
  }

  const first12 = prefix + body;
  const checkDigit = computeEan13CheckDigit(first12);

  return first12 + checkDigit;
}
