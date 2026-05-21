"use client";

import { Info, Plus, Settings, Trash2 } from "lucide-react";

import type { OptionTypeEntry } from "../types";
import {
  FieldLabel,
  FormSection,
  ToggleSwitch,
  fieldClass,
} from "./form-controls";

type GeneratedVariant = {
  key: string;
  sku: string;
  optionValues: string[];
  optionNames: string[];
  price: string;
};

type VariantSetupSectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  hasVariants: boolean;
  onHasVariantsChange: (value: boolean) => void;
  optionTypes: OptionTypeEntry[];
  generatedVariants: GeneratedVariant[];
  variantPrices: Record<string, string>;
  onVariantPriceChange: (key: string, value: string) => void;
  unitPrice: string;
  onAddOptionType: () => void;
  onUpdateOptionType: (
    id: string,
    field: keyof OptionTypeEntry,
    value: string,
  ) => void;
  onRemoveOptionType: (id: string) => void;
};

export function VariantSetupSection({
  collapsed,
  onToggle,
  hasVariants,
  onHasVariantsChange,
  optionTypes,
  generatedVariants,
  variantPrices,
  onVariantPriceChange,
  unitPrice,
  onAddOptionType,
  onUpdateOptionType,
  onRemoveOptionType,
}: VariantSetupSectionProps) {
  return (
    <FormSection
      id="variants"
      icon={Settings}
      title="Variants"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={
        hasVariants && generatedVariants.length > 0
          ? `${generatedVariants.length} variants`
          : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ToggleSwitch checked={hasVariants} onChange={onHasVariantsChange} />
          <span className="text-[13px] text-foreground">
            This item has variants
          </span>
        </div>

        {hasVariants && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
              <Info size={13} />
              <span>
                Define option types (e.g. Size, Color) and their values.
                Variants will be auto-generated as the cartesian product of all
                values.
              </span>
            </div>

            {optionTypes.map((optionType) => (
              <OptionTypeEditor
                key={optionType.id}
                optionType={optionType}
                onUpdate={onUpdateOptionType}
                onRemove={onRemoveOptionType}
              />
            ))}

            <button
              onClick={onAddOptionType}
              className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
            >
              <Plus size={13} />
              Add Option Type
            </button>

            {generatedVariants.length > 0 && (
              <VariantPreviewTable
                generatedVariants={generatedVariants}
                variantPrices={variantPrices}
                unitPrice={unitPrice}
                onVariantPriceChange={onVariantPriceChange}
              />
            )}
          </>
        )}
      </div>
    </FormSection>
  );
}

function OptionTypeEditor({
  optionType,
  onUpdate,
  onRemove,
}: {
  optionType: OptionTypeEntry;
  onUpdate: (id: string, field: keyof OptionTypeEntry, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Option Type
        </span>
        <button
          onClick={() => onRemove(optionType.id)}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Name</FieldLabel>
          <input
            type="text"
            value={optionType.name}
            onChange={(event) =>
              onUpdate(optionType.id, "name", event.target.value)
            }
            placeholder="e.g. Size"
            className={fieldClass}
          />
        </div>
        <div>
          <FieldLabel>Values</FieldLabel>
          <input
            type="text"
            value={optionType.values}
            onChange={(event) =>
              onUpdate(optionType.id, "values", event.target.value)
            }
            placeholder="Small, Medium, Large"
            className={fieldClass}
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Comma-separated
          </p>
        </div>
      </div>
    </div>
  );
}

function VariantPreviewTable({
  generatedVariants,
  variantPrices,
  unitPrice,
  onVariantPriceChange,
}: {
  generatedVariants: GeneratedVariant[];
  variantPrices: Record<string, string>;
  unitPrice: string;
  onVariantPriceChange: (key: string, value: string) => void;
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Variant Preview - {generatedVariants.length} variant
          {generatedVariants.length !== 1 ? "s" : ""} will be created
        </p>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th
              scope="col"
              className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              SKU
            </th>
            {generatedVariants[0]?.optionNames.map((name) => (
              <th
                key={name}
                scope="col"
                className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {name}
              </th>
            ))}
            <th
              scope="col"
              className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Price Override
            </th>
          </tr>
        </thead>
        <tbody>
          {generatedVariants.slice(0, 50).map((variant) => (
            <tr key={variant.key} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-[12px] text-foreground">
                {variant.sku}
              </td>
              {variant.optionValues.map((value, index) => (
                <td key={index} className="px-3 py-1.5 text-foreground">
                  {value}
                </td>
              ))}
              <td className="px-3 py-1.5">
                <div className="relative w-28">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                    {"\u20b1"}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={variantPrices[variant.key] ?? ""}
                    onChange={(event) =>
                      onVariantPriceChange(variant.key, event.target.value)
                    }
                    placeholder={unitPrice || "0.00"}
                    className="h-7 w-full rounded border border-border bg-background pl-6 pr-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/[0.08]"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {generatedVariants.length > 50 && (
        <div className="border-t border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          Showing first 50 of {generatedVariants.length} variants
        </div>
      )}
    </div>
  );
}
