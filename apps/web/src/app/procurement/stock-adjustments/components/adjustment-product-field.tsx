import { Loader2, Search, X } from "lucide-react";

import type { ProductSearchResult } from "@/hooks/use-product-search";

type AdjustmentProductFieldProps = {
  debouncedProductSearch: string;
  disabled: boolean;
  isLoading: boolean;
  productResults: ProductSearchResult[];
  productSearch: string;
  selectedProduct: ProductSearchResult | null;
  showProductDropdown: boolean;
  onClearProduct: () => void;
  onDropdownChange: (value: boolean) => void;
  onProductSearchChange: (value: string) => void;
  onSelectProduct: (product: ProductSearchResult) => void;
};

export function AdjustmentProductField({
  debouncedProductSearch,
  disabled,
  isLoading,
  productResults,
  productSearch,
  selectedProduct,
  showProductDropdown,
  onClearProduct,
  onDropdownChange,
  onProductSearchChange,
  onSelectProduct,
}: AdjustmentProductFieldProps) {
  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Item <span className="text-destructive">*</span>
      </label>
      {selectedProduct ? (
        <SelectedProductCard
          disabled={disabled}
          product={selectedProduct}
          onClearProduct={onClearProduct}
        />
      ) : (
        <>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => {
                onProductSearchChange(e.target.value);
                onDropdownChange(true);
              }}
              onFocus={() => onDropdownChange(true)}
              placeholder="Search by name or SKU..."
              disabled={disabled}
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>
          {showProductDropdown && productResults.length > 0 && (
            <ProductResultsDropdown
              products={productResults}
              onSelectProduct={onSelectProduct}
            />
          )}
          {showProductDropdown &&
            debouncedProductSearch.trim().length >= 2 &&
            productResults.length === 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-background px-3 py-3 text-center shadow-lg">
                {isLoading ? (
                  <Loader2
                    size={14}
                    className="mx-auto animate-spin text-muted-foreground"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">No products found</p>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}

type SelectedProductCardProps = {
  disabled: boolean;
  product: ProductSearchResult;
  onClearProduct: () => void;
};

function SelectedProductCard({
  disabled,
  product,
  onClearProduct,
}: SelectedProductCardProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {product.name}
        </p>
        <p className="text-[11px] font-mono text-muted-foreground">
          {product.sku}
        </p>
      </div>
      <button
        type="button"
        onClick={onClearProduct}
        disabled={disabled}
        className="ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <X size={14} />
      </button>
    </div>
  );
}

type ProductResultsDropdownProps = {
  products: ProductSearchResult[];
  onSelectProduct: (product: ProductSearchResult) => void;
};

function ProductResultsDropdown({
  products,
  onSelectProduct,
}: ProductResultsDropdownProps) {
  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
      {products.map((product) => (
        <button
          key={product.id}
          type="button"
          onClick={() => onSelectProduct(product)}
          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{product.name}</p>
            <p className="text-[11px] font-mono text-muted-foreground">
              {product.sku}
            </p>
          </div>
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
            {product.stockLevel} on hand
          </span>
        </button>
      ))}
    </div>
  );
}
