import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DetailBrand, DetailProduct } from "../types";
import { fmt } from "../utils";

type TagDemandDetailProps = {
  tagId: string;
  token: string;
  locationId: string;
  dateFrom: string;
  dateTo: string;
};

type DemandDetailApiProduct = {
  productId: string;
  name: string;
  brandName?: string | null;
  brand?: string | null;
  sku: string;
  sellPrice?: string | number;
  unitPrice?: string | number;
  qtySold?: string | number;
  revenue?: string | number;
  currentStock?: string | number;
  stock?: string | number;
};

export function TagDemandDetail({
  tagId,
  token,
  locationId,
  dateFrom,
  dateTo,
}: TagDemandDetailProps) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
  if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
  const qs = params.toString();

  const { data, isLoading } = useQuery({
    queryKey: ["demand-by-tag-detail", tagId, dateFrom, dateTo],
    queryFn: () =>
      apiFetch<{ data: DemandDetailApiProduct[] }>(`/tags/demand/${tagId}${qs ? `?${qs}` : ""}`, {
        token,
        locationId,
      }),
  });

  const rawProducts = data?.data ?? [];
  const products: DetailProduct[] = rawProducts.map((product) => ({
    productId: product.productId,
    name: product.name,
    brand: product.brandName ?? product.brand ?? null,
    sku: product.sku,
    unitPrice: String(product.sellPrice ?? product.unitPrice ?? "0"),
    qtySold: Number(product.qtySold ?? 0),
    revenue: Number(product.revenue ?? 0),
    stock: Number(product.currentStock ?? product.stock ?? 0),
    daysLeft: null,
  }));

  const brandMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const product of products) {
    const brandName = product.brand || "Unknown";
    const existing = brandMap.get(brandName) || { name: brandName, qty: 0, revenue: 0 };
    existing.qty += product.qtySold;
    existing.revenue += product.revenue;
    brandMap.set(brandName, existing);
  }
  const brands: DetailBrand[] = [...brandMap.values()]
    .sort((a, b) => b.qty - a.qty)
    .map((brand) => ({ brand: brand.name, qty: brand.qty, revenue: brand.revenue }));
  const maxBrandQty = Math.max(...brands.map((brand) => brand.qty), 1);

  if (isLoading) {
    return (
      <div className="border-t border-border bg-muted/10 px-8 py-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-border bg-muted/10 px-8 py-4">
      {brands.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Brand Breakdown</h4>
          <div className="space-y-1.5">
            {brands.map((brand, index) => (
              <div key={`${brand.brand}-${index}`} className="flex items-center gap-3">
                <span className="w-28 truncate text-[12px] text-foreground">{brand.brand || "Unknown"}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${(brand.qty / maxBrandQty) * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right text-[11px] tabular-nums text-foreground">{brand.qty} pcs</span>
                <span className="w-24 text-right text-[11px] tabular-nums text-muted-foreground">PHP {fmt(brand.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {products.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Product Detail</h4>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div className="flex-1">Product</div>
              <div className="w-24">Brand</div>
              <div className="w-24 font-mono">SKU</div>
              <div className="w-20 text-right">Price</div>
              <div className="w-16 text-right">Qty</div>
              <div className="w-24 text-right">Revenue</div>
              <div className="w-16 text-right">Stock</div>
              <div className="w-16 text-right">Days</div>
            </div>
            <div className="divide-y divide-border/50">
              {products.map((product) => (
                <div key={product.productId} className="flex items-center px-3 py-1.5">
                  <div className="flex-1 truncate text-[12px] text-foreground">{product.name}</div>
                  <div className="w-24 truncate text-[11px] text-muted-foreground">{product.brand ?? "-"}</div>
                  <div className="w-24 font-mono text-[10px] text-muted-foreground">{product.sku}</div>
                  <div className="w-20 text-right text-[11px] tabular-nums text-foreground">
                    PHP {parseFloat(product.unitPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="w-16 text-right text-[11px] tabular-nums text-foreground">{product.qtySold}</div>
                  <div className="w-24 text-right text-[11px] tabular-nums text-foreground">PHP {fmt(product.revenue)}</div>
                  <div className="w-16 text-right text-[11px] tabular-nums text-foreground">{product.stock}</div>
                  <div
                    className={cn(
                      "w-16 text-right text-[11px] font-medium tabular-nums",
                      product.daysLeft != null && product.daysLeft <= 14
                        ? "text-red-600"
                        : product.daysLeft != null && product.daysLeft <= 30
                          ? "text-amber-600"
                          : "text-foreground",
                    )}
                  >
                    {product.daysLeft != null ? product.daysLeft : "-"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {brands.length === 0 && products.length === 0 && (
        <p className="text-[12px] text-muted-foreground">No detail data available for this period.</p>
      )}
    </div>
  );
}
