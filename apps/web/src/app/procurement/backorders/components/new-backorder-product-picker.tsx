import { Loader2, Search, X } from "lucide-react";

import type { ProductSearchResult } from "../types";

type NewBackorderProductPickerProps = {
  productResults: ProductSearchResult[];
  productSearch: string;
  productSearchLoading: boolean;
  selectedProduct: ProductSearchResult | null;
  onProductResultsChange: (value: ProductSearchResult[]) => void;
  onProductSearchChange: (value: string) => void;
  onSelectedProductChange: (value: ProductSearchResult | null) => void;
};

export function NewBackorderProductPicker({
  productResults,
  productSearch,
  productSearchLoading,
  selectedProduct,
  onProductResultsChange,
  onProductSearchChange,
  onSelectedProductChange,
}: NewBackorderProductPickerProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        Product <span className="text-red-500">*</span>
      </label>
      {selectedProduct ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-gray-50 px-3 py-2">
          <div>
            <div className="text-sm font-medium text-foreground">
              {selectedProduct.name}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {selectedProduct.sku}
            </div>
          </div>
          <button
            onClick={() => {
              onSelectedProductChange(null);
              onProductSearchChange("");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={productSearch}
            onChange={(e) => onProductSearchChange(e.target.value)}
            placeholder="Search product by name or SKU..."
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
          {productSearchLoading && (
            <Loader2
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
          {productResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-white shadow-lg">
              {productResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    onSelectedProductChange(product);
                    onProductSearchChange("");
                    onProductResultsChange([]);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {product.name}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {product.sku}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
