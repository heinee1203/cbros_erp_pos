"use client";

import { DrilldownFamilyRow } from "./components/drilldown-hierarchy-rows";
import { DrilldownLoadingRow } from "./components/drilldown-items-table";
import { useInventoryDrilldown } from "./lib/use-inventory-drilldown";

const NONE = "__none__";

interface DrillDownViewProps {
  token: string;
  locationId: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  familyFilter?: string;
  categoryFilter?: string;
  brandFilter?: string;
  colCount: number;
  allLocations?: boolean;
}

export function DrillDownView({
  token,
  locationId,
  stockStatus,
  showFinancials,
  onSelectProduct,
  familyFilter,
  colCount,
  allLocations,
}: DrillDownViewProps) {
  const {
    expandedBrands,
    expandedCategories,
    expandedFamilies,
    expandedMakes,
    isLoading,
    toggleBrand,
    toggleCategory,
    toggleFamily,
    toggleMake,
    visibleFamilies,
  } = useInventoryDrilldown({
    token,
    locationId,
    stockStatus,
    familyFilter,
    allLocations,
  });

  if (isLoading) return <DrilldownLoadingRow colCount={colCount} />;

  return (
    <>
      {visibleFamilies.map((fam) => {
        const familyId = fam.id ?? NONE;
        const familyKey = familyId;
        const isExpanded = expandedFamilies.has(familyKey);
        const name = fam.id ? fam.name : "No Family";

        return (
          <DrilldownFamilyRow
            key={familyKey}
            familyKey={familyKey}
            name={name}
            itemCount={fam.itemCount}
            categoryCount={fam.categoryCount}
            isExpanded={isExpanded}
            onToggle={() => toggleFamily(familyKey)}
            token={token}
            locationId={locationId}
            familyId={familyId}
            stockStatus={stockStatus}
            showFinancials={showFinancials}
            onSelectProduct={onSelectProduct}
            colCount={colCount}
            expandedCategories={expandedCategories}
            expandedBrands={expandedBrands}
            expandedMakes={expandedMakes}
            onToggleCategory={toggleCategory}
            onToggleBrand={toggleBrand}
            onToggleMake={toggleMake}
            allLocations={allLocations}
          />
        );
      })}
      {visibleFamilies.length === 0 && (
        <tr>
          <td className="w-9" />
          <td colSpan={colCount - 1} className="py-8 text-center text-sm text-muted-foreground">
            No product families found
          </td>
        </tr>
      )}
    </>
  );
}
