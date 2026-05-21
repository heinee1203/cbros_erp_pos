import { useCallback, useEffect, useMemo, useState } from "react";
import { useGroupedCounts, type FamilyCountRow } from "@/hooks/use-grouped-counts";

const NONE = "__none__";

type InventoryDrilldownArgs = {
  token: string;
  locationId: string;
  stockStatus?: string;
  familyFilter?: string;
  allLocations?: boolean;
};

function sortNullLast<T extends { id?: string | null; name?: string; make?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aNull = a.id === null || a.id === NONE || a.make === NONE;
    const bNull = b.id === null || b.id === NONE || b.make === NONE;
    if (aNull && !bNull) return 1;
    if (!aNull && bNull) return -1;
    return 0;
  });
}

export function useInventoryDrilldown({
  token,
  locationId,
  stockStatus,
  familyFilter,
  allLocations,
}: InventoryDrilldownArgs) {
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [expandedMakes, setExpandedMakes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (familyFilter) {
      setExpandedFamilies((prev) => {
        const next = new Set(prev);
        next.add(familyFilter);
        return next;
      });
    }
  }, [familyFilter]);

  const toggleFamily = useCallback((key: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setExpandedCategories((s) => {
          const n = new Set<string>();
          s.forEach((k) => {
            if (!k.startsWith(`${key}:`)) n.add(k);
          });
          return n;
        });
        setExpandedBrands((s) => {
          const n = new Set<string>();
          s.forEach((k) => {
            if (!k.startsWith(`${key}:`)) n.add(k);
          });
          return n;
        });
        setExpandedMakes((s) => {
          const n = new Set<string>();
          s.forEach((k) => {
            if (!k.startsWith(`${key}:`)) n.add(k);
          });
          return n;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setExpandedBrands((s) => {
          const n = new Set<string>();
          s.forEach((k) => {
            if (!k.startsWith(`${key}:`)) n.add(k);
          });
          return n;
        });
        setExpandedMakes((s) => {
          const n = new Set<string>();
          s.forEach((k) => {
            if (!k.startsWith(`${key}:`)) n.add(k);
          });
          return n;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleBrand = useCallback((key: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setExpandedMakes((s) => {
          const n = new Set<string>();
          s.forEach((k) => {
            if (!k.startsWith(`${key}:`)) n.add(k);
          });
          return n;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleMake = useCallback((key: string) => {
    setExpandedMakes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const { data: familyData, isLoading } = useGroupedCounts<FamilyCountRow>(
    token,
    locationId,
    "family",
    { stockStatus, allLocations },
  );

  const families = useMemo(() => sortNullLast(familyData?.data ?? []), [familyData]);
  const visibleFamilies = useMemo(
    () => (familyFilter ? families.filter((fam) => fam.id === familyFilter) : families),
    [families, familyFilter],
  );

  return {
    expandedFamilies,
    expandedCategories,
    expandedBrands,
    expandedMakes,
    isLoading,
    toggleBrand,
    toggleCategory,
    toggleFamily,
    toggleMake,
    visibleFamilies,
  };
}
