export function calculateNetCost(listPrice: number, discountChain: string): number {
  if (!listPrice || listPrice <= 0) return 0;
  const discounts = discountChain
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((d) => !isNaN(d) && d > 0 && d < 100);
  let net = listPrice;
  for (const discount of discounts) {
    net = net * (1 - discount / 100);
  }
  return Math.round(net * 100) / 100;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
