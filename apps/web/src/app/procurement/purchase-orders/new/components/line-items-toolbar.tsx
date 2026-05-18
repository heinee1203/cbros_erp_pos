"use client";

import type { ChangeEvent, RefObject } from "react";

import { fmtPeso, getProductDisplayName } from "@/lib/format";

import type { ProductSearchResult } from "../types";

interface LineItemsToolbarProps {
  productSearch: string;
  productResults: ProductSearchResult[];
  searchLoading: boolean;
  showDropdown: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  dropdownRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onProductSearchChange: (value: string) => void;
  onAddProduct: (product: ProductSearchResult) => void;
  onCSVUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
}

export function LineItemsToolbar({
  productSearch,
  productResults,
  searchLoading,
  showDropdown,
  searchRef,
  dropdownRef,
  fileInputRef,
  onProductSearchChange,
  onAddProduct,
  onCSVUpload,
  onDownloadTemplate,
}: LineItemsToolbarProps) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={searchRef}
          type="text"
          value={productSearch}
          onChange={(e) => onProductSearchChange(e.target.value)}
          placeholder="Search products to add..."
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        {searchLoading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        )}
        {showDropdown && productResults.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
          >
            {productResults.map((p) => (
              <button
                key={p.id}
                onClick={() => onAddProduct(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <div>
                  <span className="font-medium">{getProductDisplayName(p)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.sku}
                  </span>
                  {p.categoryName && (
                    <span className="ml-2 text-[10px] text-muted-foreground/70">
                      {p.categoryName}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs font-mono text-muted-foreground">
                  {fmtPeso(p.costPrice || "0.00")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Import CSV
      </button>
      <button
        type="button"
        onClick={onDownloadTemplate}
        className="text-xs text-primary hover:underline"
      >
        Download template
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={onCSVUpload}
        className="hidden"
      />
    </div>
  );
}
