"use client";

import { DollarSign } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  CurrencyInput,
  FieldLabel,
  FormSection,
} from "./form-controls";

type PricingSectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  showCost: boolean;
  unitPrice: string;
  onUnitPriceChange: (value: string) => void;
  costPrice: string;
  onCostPriceChange: (value: string) => void;
  margin: string | null;
};

export function PricingSection({
  collapsed,
  onToggle,
  showCost,
  unitPrice,
  onUnitPriceChange,
  costPrice,
  onCostPriceChange,
  margin,
}: PricingSectionProps) {
  return (
    <FormSection
      id="pricing"
      icon={DollarSign}
      title="Pricing"
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <div
        className={cn(
          "grid gap-x-4 gap-y-3",
          showCost ? "grid-cols-3" : "grid-cols-1",
        )}
      >
        <div>
          <FieldLabel>Sell Price</FieldLabel>
          <CurrencyInput value={unitPrice} onChange={onUnitPriceChange} />
        </div>
        {showCost && (
          <>
            <div>
              <FieldLabel>Cost Price</FieldLabel>
              <CurrencyInput value={costPrice} onChange={onCostPriceChange} />
            </div>
            <div>
              <FieldLabel>Margin</FieldLabel>
              <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-[13px]">
                {margin !== null ? (
                  <span
                    className={cn(
                      "font-medium",
                      parseFloat(margin) > 30
                        ? "text-success"
                        : parseFloat(margin) > 0
                          ? "text-warning"
                          : "text-destructive",
                    )}
                  >
                    {margin}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">{"\u2014"}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </FormSection>
  );
}
