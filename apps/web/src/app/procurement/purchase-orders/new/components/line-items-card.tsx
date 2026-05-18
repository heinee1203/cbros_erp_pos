"use client";

import type { ChangeEvent, RefObject } from "react";
import type { POLineInput, ProductSearchResult } from "../types";
import type { PurchaseOrderProductSearchController } from "../use-purchase-order-product-search";
import { LineItemsTable } from "./line-items-table";
import { LineItemsToolbar } from "./line-items-toolbar";

type LineItemsCardProps = {
  lines: POLineInput[];
  grandTotal: number;
  csvError: string | null;
  productSearchController: PurchaseOrderProductSearchController;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAddProduct: (product: ProductSearchResult) => void;
  onCSVUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
  onRemoveLine: (localId: string) => void;
  onUpdateLine: (
    localId: string,
    field: keyof POLineInput,
    value: string | number | boolean,
  ) => void;
};

export function LineItemsCard({
  lines,
  grandTotal,
  csvError,
  productSearchController,
  fileInputRef,
  onAddProduct,
  onCSVUpload,
  onDownloadTemplate,
  onRemoveLine,
  onUpdateLine,
}: LineItemsCardProps) {
  return (
    <div className="mb-4 flex-1 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Line Items
        </h3>
      </div>

      <LineItemsToolbar
        productSearch={productSearchController.productSearch}
        productResults={productSearchController.productResults}
        searchLoading={productSearchController.searchLoading}
        showDropdown={productSearchController.showDropdown}
        searchRef={productSearchController.searchRef}
        dropdownRef={productSearchController.dropdownRef}
        fileInputRef={fileInputRef}
        onProductSearchChange={productSearchController.setProductSearch}
        onAddProduct={onAddProduct}
        onCSVUpload={onCSVUpload}
        onDownloadTemplate={onDownloadTemplate}
      />

      {csvError && (
        <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          {csvError}
        </div>
      )}

      <LineItemsTable
        lines={lines}
        grandTotal={grandTotal}
        onRemoveLine={onRemoveLine}
        onUpdateLine={onUpdateLine}
      />
    </div>
  );
}
