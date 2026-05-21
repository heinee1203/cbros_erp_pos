"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/app/auth-context";
import { useVariants } from "@/hooks/use-variants";

type ParentAwareCheckboxProps = {
  isParent: boolean;
  isSelected: boolean;
  parentId: string;
  getParentCheckState: (parentId: string, variantIds: string[]) => boolean | "indeterminate";
  onToggleSelect: () => void;
  onToggleParentSelect: (parentId: string, variantIds: string[]) => void;
};

export function ParentAwareCheckbox({
  isParent,
  isSelected,
  parentId,
  getParentCheckState,
  onToggleSelect,
  onToggleParentSelect,
}: ParentAwareCheckboxProps) {
  const { token, locationId } = useAuth();
  const { data } = useVariants(token, locationId, isParent ? parentId : undefined);
  const variantIds = useMemo(() => (data?.data ?? []).map((v) => v.id), [data]);

  const checkboxRef = useRef<HTMLInputElement>(null);
  const checkState = isParent ? getParentCheckState(parentId, variantIds) : isSelected;

  useEffect(() => {
    if (checkboxRef.current && isParent) {
      checkboxRef.current.indeterminate = checkState === "indeterminate";
    }
  }, [checkState, isParent]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checkState === true}
      onChange={() => {
        if (isParent) {
          onToggleParentSelect(parentId, variantIds);
        } else {
          onToggleSelect();
        }
      }}
      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
    />
  );
}
