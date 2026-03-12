// Generate a deterministic 10-character mnemonic SKU from product name + counter
// Satisfies chk_mnemonic_sku_length (exactly 10 chars)

const used = new Map<string, number>(); // prefix → next counter

export function generateMnemonicSku(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6)
    .padEnd(6, "X");
  const counter = used.get(prefix) ?? 0;
  used.set(prefix, counter + 1);
  const suffix = String(counter).padStart(4, "0");
  return prefix + suffix; // Exactly 10 chars
}

export function resetMnemonicState() {
  used.clear();
}
