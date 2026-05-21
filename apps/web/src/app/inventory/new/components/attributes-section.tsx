"use client";

import { Info, Layers, Plus, Trash2 } from "lucide-react";

import type { AttributeEntry } from "../types";
import { FormSection, fieldClass } from "./form-controls";

type AttributesSectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  attributes: AttributeEntry[];
  onAddAttribute: () => void;
  onUpdateAttribute: (
    id: string,
    field: keyof AttributeEntry,
    value: string,
  ) => void;
  onRemoveAttribute: (id: string) => void;
};

export function AttributesSection({
  collapsed,
  onToggle,
  attributes,
  onAddAttribute,
  onUpdateAttribute,
  onRemoveAttribute,
}: AttributesSectionProps) {
  return (
    <FormSection
      id="attributes"
      icon={Layers}
      title="Attributes"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={attributes.length > 0 ? `${attributes.length} attr` : undefined}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          <Info size={13} />
          <span>
            Define attributes (e.g. Pack Size, Viscosity, Tire Size) as
            metadata for this product.
          </span>
        </div>

        {attributes.map((attribute) => (
          <div key={attribute.id} className="flex items-start gap-2">
            <div className="grid flex-1 grid-cols-2 gap-2">
              <input
                type="text"
                value={attribute.name}
                onChange={(event) =>
                  onUpdateAttribute(attribute.id, "name", event.target.value)
                }
                placeholder="Attribute (e.g. Pack Size)"
                className={fieldClass}
              />
              <input
                type="text"
                value={attribute.values}
                onChange={(event) =>
                  onUpdateAttribute(attribute.id, "values", event.target.value)
                }
                placeholder="Values (comma-separated: 1L, 4L, 5L)"
                className={fieldClass}
              />
            </div>
            <button
              onClick={() => onRemoveAttribute(attribute.id)}
              className="mt-1.5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button
          onClick={onAddAttribute}
          className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
        >
          <Plus size={13} />
          Add Attribute
        </button>
      </div>
    </FormSection>
  );
}
