import type { OptionTypeEntry } from "./types";

export type GeneratedVariant = {
  key: string;
  sku: string;
  optionValues: string[];
  optionNames: string[];
  price: string;
};

export function generateVariants({
  optionTypes,
  sku,
  variantPrices,
}: {
  optionTypes: OptionTypeEntry[];
  sku: string;
  variantPrices: Record<string, string>;
}): GeneratedVariant[] {
  const validOptions = optionTypes.filter(
    (option) => option.name.trim() && option.values.trim(),
  );
  if (validOptions.length === 0) return [];

  const valueSets = validOptions.map((option) =>
    option.values
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const combos = combineValues(valueSets);
  const baseSku = sku.trim() || "ITEM";

  return combos.map((combo) => {
    const suffix = combo
      .map((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2))
      .join("-");
    const key = combo.join("|");

    return {
      key,
      sku: `${baseSku}-${suffix}`,
      optionValues: combo,
      optionNames: validOptions.map((option) => option.name),
      price: variantPrices[key] ?? "",
    };
  });
}

function combineValues(sets: string[][]): string[][] {
  if (sets.length === 0) return [[]];
  const [first, ...rest] = sets;
  const sub = combineValues(rest);
  return first.flatMap((value) => sub.map((item) => [value, ...item]));
}
