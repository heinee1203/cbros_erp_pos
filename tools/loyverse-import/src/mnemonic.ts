// Generate a unique 10-character mnemonic SKU from product name
// Strategy: 4-char prefix from name + 6-char random uppercase letters
// Uses a Set to track generated values within a single import run

const used = new Set<string>();

export function generateMnemonicSku(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 100; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = prefix + suffix;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  // Fallback: timestamp-based
  const ts = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, "X");
  const fallback = prefix + ts;
  used.add(fallback);
  return fallback;
}

export function resetMnemonicState() {
  used.clear();
}
