import type {
  ProductStockRow,
  ProductStockSummary,
  SortDir,
  SortField,
  StockLevelRow,
  StockLevelsSummary,
} from "@/hooks/use-stock-levels";
import type { PendingOrdersData, ReorderTarget } from "@/components/procurement/reorder-workflow";

export type StockLevelsViewMode = "product" | "location";

export type StockLevelsController = {
  allCategories: any[];
  allFamilies: any[];
  allLocations: boolean;
  authLoading: boolean;
  belowReorder: boolean;
  categoryFilter: string;
  clearFilters: () => void;
  createDraftPO: (
    item: ReorderTarget,
    supplier: PendingOrdersData["lastSupplier"],
    suggestedQty: number,
  ) => void | Promise<void>;
  dismissModal: () => void;
  error: unknown;
  familyFilter: string;
  fetchNextPage: () => void;
  filteredCategories: any[];
  filteredSubcategories: any[];
  handleReorder: (productId: string, productName: string) => void;
  handleSearchChange: (value: string) => void;
  handleSnooze: (productId: string, days: number) => void;
  handleSort: (field: SortField) => void;
  hasActiveFilters: boolean;
  hasNextPage: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  productRows: ProductStockRow[];
  productSummary: ProductStockSummary | null;
  reorderLoading: string | null;
  reorderModal: { item: ReorderTarget; data: PendingOrdersData } | null;
  rows: StockLevelRow[];
  searchQuery: string;
  setAllLocations: (value: boolean) => void;
  setBelowReorder: (value: boolean) => void;
  setCategoryFilter: (value: string) => void;
  setFamilyFilter: (value: string) => void;
  setStockStatusFilter: (value: string) => void;
  setSubcategoryFilter: (value: string) => void;
  setViewMode: (value: StockLevelsViewMode) => void;
  sortBy: SortField;
  sortDir: SortDir;
  stockStatusFilter: string;
  subcategoryFilter: string;
  successMessage: string | null;
  summary: StockLevelsSummary | null;
  viewExistingDraft: (poNumber: string) => void;
  viewMode: StockLevelsViewMode;
};
