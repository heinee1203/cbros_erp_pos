export function parseDiscountExpression(input: string): { listPrice: number; discountExpr: string; netCost: number } | null {
  if (!input || !input.trim()) return null;

  const cleaned = input.replace(/,/g, "").trim();
  const match = cleaned.match(/^(\d+\.?\d*)\s*((?:\s*-\s*\d+\.?\d*%?\s*)*)$/);
  if (!match) return null;

  const listPrice = parseFloat(match[1]);
  if (Number.isNaN(listPrice)) return null;

  const discountPart = match[2].trim();
  let netCost = listPrice;

  if (discountPart) {
    const discounts = discountPart.match(/-\s*(\d+\.?\d*)(%?)/g);
    if (discounts) {
      for (const discount of discounts) {
        const discountMatch = discount.match(/-\s*(\d+\.?\d*)(%?)/);
        if (discountMatch) {
          const value = parseFloat(discountMatch[1]);
          netCost = discountMatch[2] === "%" ? netCost * (1 - value / 100) : netCost - value;
        }
      }
    }
  }

  return { listPrice, discountExpr: discountPart, netCost: Math.round(netCost * 100) / 100 };
}

export function recalcNetCost(listPrice: number, discountExpression: string): number {
  if (!discountExpression.trim()) return listPrice;
  const result = parseDiscountExpression(`${listPrice} ${discountExpression}`);
  return result ? result.netCost : listPrice;
}

export function calculateNetCost(listPrice: number, discountChain: string): number {
  if (!listPrice || listPrice <= 0) return 0;

  const discounts = discountChain
    .split(",")
    .map((value) => parseFloat(value.trim()))
    .filter((discount) => !Number.isNaN(discount) && discount > 0 && discount < 100);

  let net = listPrice;
  for (const discount of discounts) {
    net *= 1 - discount / 100;
  }

  return Math.round(net * 100) / 100;
}
