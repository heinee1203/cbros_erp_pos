/**
 * Convert a numeric amount to words in English for Philippine Peso receipts.
 * e.g., 45570.00 → "FORTY-FIVE THOUSAND FIVE HUNDRED SEVENTY PESOS ONLY"
 * e.g., 45570.50 → "FORTY-FIVE THOUSAND FIVE HUNDRED SEVENTY PESOS AND 50/100"
 */

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function chunk(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = ONES[n % 10];
    return o ? `${t}-${o}` : t;
  }
  const h = ONES[Math.floor(n / 100)] + " HUNDRED";
  const rem = n % 100;
  return rem ? `${h} ${chunk(rem)}` : h;
}

export function amountToWords(amount: number): string {
  if (amount === 0) return "ZERO PESOS ONLY";

  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);

  const parts: string[] = [];

  if (whole >= 1_000_000_000) {
    parts.push(chunk(Math.floor(whole / 1_000_000_000)) + " BILLION");
  }
  const afterBillion = whole % 1_000_000_000;

  if (afterBillion >= 1_000_000) {
    parts.push(chunk(Math.floor(afterBillion / 1_000_000)) + " MILLION");
  }
  const afterMillion = afterBillion % 1_000_000;

  if (afterMillion >= 1_000) {
    parts.push(chunk(Math.floor(afterMillion / 1_000)) + " THOUSAND");
  }
  const afterThousand = afterMillion % 1_000;

  if (afterThousand > 0) {
    parts.push(chunk(afterThousand));
  }

  const wordsPart = parts.join(" ") || "ZERO";

  if (cents === 0) {
    return `${wordsPart} PESOS ONLY`;
  }
  return `${wordsPart} PESOS AND ${String(cents).padStart(2, "0")}/100`;
}
