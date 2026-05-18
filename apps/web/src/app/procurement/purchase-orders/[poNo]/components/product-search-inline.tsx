"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useProducts, type ProductRow } from "@/hooks/use-products";

export function ProductSearchInline({
  onSelect,
}: {
  onSelect: (product: ProductRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { token, locationId } = useAuth();

  const { data } = useProducts(token, locationId, {
    search: query,
    limit: 8,
    allLocations: true,
  });
  const results = data?.data ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center gap-2">
      <div className="relative">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(event.target.value.length >= 2);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Search product to add..."
          className="h-7 w-64 rounded border border-border bg-background pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
        />
      </div>

      {open && query.length >= 2 && results.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-60 w-96 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {results.map((product) => (
            <button
              key={product.id}
              onClick={() => {
                onSelect(product);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
            >
              <div>
                <div className="font-medium text-foreground">
                  {(product as any).parentName
                    ? `${(product as any).parentName} (${product.name})`
                    : product.name}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {product.sku}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Cost: {product.costPrice || "\u2014"}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-lg">
          No products found
        </div>
      )}
    </div>
  );
}
