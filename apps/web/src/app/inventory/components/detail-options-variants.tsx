"use client";

import { useState } from "react";
import { Loader2, Plus, Settings, Trash2, X, Zap } from "lucide-react";
import type { ProductRow } from "@/hooks/use-products";
import { useVariants, useCreateVariantBatch, useDeleteVariant } from "@/hooks/use-variants";
import {
  useProductOptions,
  useCreateOptionType,
  useDeleteOptionType,
  useAddOptionValue,
  useDeleteOptionValue,
} from "@/hooks/use-product-options";
import { useConfirm } from "@/components/confirm-dialog";
import { formatPrice } from "../lib/inventory-utils";

interface DetailOptionsVariantsProps {
  locationId: string;
  product: ProductRow;
  showFinancials: boolean;
  token: string;
}

export function DetailOptionsVariants({
  locationId,
  product,
  showFinancials,
  token,
}: DetailOptionsVariantsProps) {
  const confirm = useConfirm();
  const [showAddOption, setShowAddOption] = useState(false);
  const [addingValueForType, setAddingValueForType] = useState<string | null>(null);
  const [newValueInput, setNewValueInput] = useState("");
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  const optionsQuery = useProductOptions(token, locationId, product.id);
  const optionTypes = optionsQuery.data?.data ?? [];
  const variantsQuery = useVariants(token, locationId, product.id);
  const variants = (variantsQuery.data?.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const createOptionType = useCreateOptionType(token, locationId);
  const deleteOptionType = useDeleteOptionType(token, locationId);
  const addOptionValue = useAddOptionValue(token, locationId);
  const deleteOptionValue = useDeleteOptionValue(token, locationId);
  const createVariantBatch = useCreateVariantBatch(token, locationId);
  const deleteVariant = useDeleteVariant(token, locationId);

  const handleDeleteOptionType = async (typeId: string, typeName: string) => {
    const ok = await confirm({
      title: "Delete Option Type",
      message: `Delete "${typeName}" and all its values? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteOptionType.mutate({ productId: product.id, typeId });
  };

  const handleDeleteOptionValue = async (typeId: string, valueId: string, valueName: string) => {
    const ok = await confirm({
      title: "Delete Option Value",
      message: `Delete "${valueName}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteOptionValue.mutate({ productId: product.id, typeId, valueId });
  };

  const handleAddValue = (typeId: string) => {
    const value = newValueInput.trim();
    if (!value) return;
    addOptionValue.mutate(
      { productId: product.id, typeId, value },
      { onSuccess: () => { setNewValueInput(""); setAddingValueForType(null); } },
    );
  };

  const handleDeleteVariant = async (variantId: string, label: string) => {
    const ok = await confirm({
      title: "Delete Variant",
      message: `Delete variant "${label}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteVariant.mutate({ parentId: product.id, variantId });
  };

  const cartesianProduct = (arrays: string[][]): string[][] => {
    if (arrays.length === 0) return [[]];
    return arrays.reduce<string[][]>(
      (acc, array) => acc.flatMap((combo) => array.map((value) => [...combo, value])),
      [[]],
    );
  };

  const generateVariants = () => {
    if (optionTypes.length === 0) return;
    const valueArrays = optionTypes.map((optionType) => optionType.values.map((value) => value.id));
    const labelArrays = optionTypes.map((optionType) => optionType.values.map((value) => value.value));
    const idCombinations = cartesianProduct(valueArrays);
    const labelCombinations = cartesianProduct(labelArrays);

    const parentSku = product.sku || "ITEM";
    const newVariants = idCombinations.map((ids, index) => {
      const labels = labelCombinations[index];
      const suffix = labels.map((label) => label.slice(0, 2).toUpperCase()).join("-");
      return {
        sku: `${parentSku}-${suffix}`,
        optionValueIds: ids,
      };
    });

    createVariantBatch.mutate(
      { parentId: product.id, variants: newVariants },
      { onSuccess: () => setShowGenerateConfirm(false) },
    );
  };

  const totalCombinations = optionTypes.length > 0
    ? optionTypes.reduce((acc, optionType) => acc * Math.max(optionType.values.length, 1), 1)
    : 0;

  return (
    <>
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Settings size={10} className="mb-px mr-1 inline" />
            Option Types
          </h4>
          <button
            onClick={() => setShowAddOption(true)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/[0.06]"
          >
            <Plus size={11} /> Add Option
          </button>
        </div>

        {optionsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading options...
          </div>
        ) : optionTypes.length === 0 && !showAddOption ? (
          <p className="py-2 text-xs text-muted-foreground">No option types defined. Add options like Size, Color, etc.</p>
        ) : (
          <div className="space-y-3">
            {optionTypes.map((optionType) => (
              <div key={optionType.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-foreground">{optionType.name}</span>
                  <button
                    onClick={() => handleDeleteOptionType(optionType.id, optionType.name)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {optionType.values.map((value) => (
                    <span key={value.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                      {value.value}
                      <button
                        onClick={() => handleDeleteOptionValue(optionType.id, value.id, value.value)}
                        className="rounded-full p-px text-muted-foreground/60 hover:text-destructive"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                {addingValueForType === optionType.id ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newValueInput}
                      onChange={(event) => setNewValueInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddValue(optionType.id);
                        }
                        if (event.key === "Escape") {
                          setAddingValueForType(null);
                          setNewValueInput("");
                        }
                      }}
                      placeholder="Value..."
                      autoFocus
                      className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:border-primary/40"
                    />
                    <button
                      onClick={() => handleAddValue(optionType.id)}
                      disabled={!newValueInput.trim()}
                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingValueForType(null); setNewValueInput(""); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingValueForType(optionType.id); setNewValueInput(""); }}
                    className="mt-1.5 text-[10px] font-medium text-primary hover:underline"
                  >
                    + Add Value
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {showAddOption && (
          <AddOptionTypeForm
            productId={product.id}
            token={token}
            locationId={locationId}
            onClose={() => setShowAddOption(false)}
          />
        )}
      </section>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Variants
            {variants.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums">
                {variants.length}
              </span>
            )}
          </h4>
          {optionTypes.length > 0 && totalCombinations > 0 && (
            <button
              onClick={() => setShowGenerateConfirm(true)}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/[0.06]"
            >
              <Zap size={11} /> Generate All
            </button>
          )}
        </div>

        {variantsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading variants...
          </div>
        ) : variants.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No variants yet. Add option types and generate combinations.</p>
        ) : (
          <div className="space-y-1">
            {variants.map((variant) => {
              const optLabel = variant.options.map((option) => option.value).join(" \u00B7 ");
              const price = parseFloat(variant.unitPrice) || 0;
              return (
                <div key={variant.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="truncate text-[12px] font-semibold text-foreground">{variant.name}</span>
                      <span className="ml-2 shrink-0 text-[11px] tabular-nums text-muted-foreground">Stock: {variant.stockLevel}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="font-mono tracking-tight">SKU: {variant.sku}</span>
                      <span className="tabular-nums">{price > 0 ? formatPrice(price) : "Variable"}</span>
                      {variant.options.length > 0 && variant.options.map((option, index) => (
                        <span key={index} className="rounded-full bg-primary/[0.06] px-1.5 py-px text-[10px] font-medium text-primary">
                          {option.value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteVariant(variant.id, variant.name || optLabel || variant.sku)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {showGenerateConfirm && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <p className="text-[12px] font-medium text-foreground">
              Generate {totalCombinations} variant SKU{totalCombinations !== 1 ? "s" : ""}?
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              This will create variants from all combinations of your option values.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={generateVariants}
                disabled={createVariantBatch.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createVariantBatch.isPending ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {createVariantBatch.isPending ? "Generating..." : "Generate"}
              </button>
              <button
                onClick={() => setShowGenerateConfirm(false)}
                className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function AddOptionTypeForm({
  productId,
  token,
  locationId,
  onClose,
}: {
  productId: string;
  token: string;
  locationId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [valuesStr, setValuesStr] = useState("");
  const createOptionType = useCreateOptionType(token, locationId);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const values = valuesStr
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) return;
    createOptionType.mutate(
      { productId, name: trimmedName, values },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">Option Name</label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Size, Color"
          autoFocus
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">Values (comma-separated)</label>
        <input
          type="text"
          value={valuesStr}
          onChange={(event) => setValuesStr(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSave();
            }
          }}
          placeholder="e.g. Small, Medium, Large"
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !valuesStr.trim() || createOptionType.isPending}
          className="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {createOptionType.isPending ? "Saving..." : "Save"}
        </button>
        <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}
