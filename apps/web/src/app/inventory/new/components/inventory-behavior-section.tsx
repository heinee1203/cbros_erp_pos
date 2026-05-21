"use client";

import { Warehouse } from "lucide-react";

import { cn } from "@/lib/utils";

import { UNITS_OF_MEASURE } from "../constants";
import {
  FieldLabel,
  FormSection,
  ToggleSwitch,
  fieldClass,
} from "./form-controls";

type InventoryBehaviorSectionProps = {
  collapsed: boolean;
  onToggle: () => void;
  trackInventory: boolean;
  onTrackInventoryChange: (value: boolean) => void;
  unitOfMeasure: string;
  onUnitOfMeasureChange: (value: string) => void;
  reorderPoint: string;
  onReorderPointChange: (value: string) => void;
  optimalStock: string;
  onOptimalStockChange: (value: string) => void;
  leadTimeDays: string;
  onLeadTimeDaysChange: (value: string) => void;
  initialStock: string;
  onInitialStockChange: (value: string) => void;
  barcode: string;
  onBarcodeChange: (value: string) => void;
  oemNumber: string;
  onOemNumberChange: (value: string) => void;
  unitsPerCase: number;
  onUnitsPerCaseChange: (value: number) => void;
  packagingUnit: string | null;
  onPackagingUnitChange: (value: string | null) => void;
  sellingUnit: string;
  onSellingUnitChange: (value: string) => void;
  purchaseUnit: string;
  onPurchaseUnitChange: (value: string) => void;
  conversionFactor: string;
  onConversionFactorChange: (value: string) => void;
  costPrice: string;
  unitPrice: string;
};

export function InventoryBehaviorSection({
  collapsed,
  onToggle,
  trackInventory,
  onTrackInventoryChange,
  unitOfMeasure,
  onUnitOfMeasureChange,
  reorderPoint,
  onReorderPointChange,
  optimalStock,
  onOptimalStockChange,
  leadTimeDays,
  onLeadTimeDaysChange,
  initialStock,
  onInitialStockChange,
  barcode,
  onBarcodeChange,
  oemNumber,
  onOemNumberChange,
  unitsPerCase,
  onUnitsPerCaseChange,
  packagingUnit,
  onPackagingUnitChange,
  sellingUnit,
  onSellingUnitChange,
  purchaseUnit,
  onPurchaseUnitChange,
  conversionFactor,
  onConversionFactorChange,
  costPrice,
  unitPrice,
}: InventoryBehaviorSectionProps) {
  return (
    <FormSection
      id="inventory"
      icon={Warehouse}
      title="Inventory Behavior"
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ToggleSwitch
            checked={trackInventory}
            onChange={onTrackInventoryChange}
          />
          <span className="text-[13px] text-foreground">
            Track inventory for this item
          </span>
        </div>

        {trackInventory && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
            <InventoryFields
              unitOfMeasure={unitOfMeasure}
              onUnitOfMeasureChange={onUnitOfMeasureChange}
              reorderPoint={reorderPoint}
              onReorderPointChange={onReorderPointChange}
              optimalStock={optimalStock}
              onOptimalStockChange={onOptimalStockChange}
              leadTimeDays={leadTimeDays}
              onLeadTimeDaysChange={onLeadTimeDaysChange}
              initialStock={initialStock}
              onInitialStockChange={onInitialStockChange}
              barcode={barcode}
              onBarcodeChange={onBarcodeChange}
              oemNumber={oemNumber}
              onOemNumberChange={onOemNumberChange}
            />
          </div>
        )}
      </div>

      <PackagingFields
        unitsPerCase={unitsPerCase}
        onUnitsPerCaseChange={onUnitsPerCaseChange}
        packagingUnit={packagingUnit}
        onPackagingUnitChange={onPackagingUnitChange}
        costPrice={costPrice}
        unitPrice={unitPrice}
      />

      <UnitConversionFields
        sellingUnit={sellingUnit}
        onSellingUnitChange={onSellingUnitChange}
        purchaseUnit={purchaseUnit}
        onPurchaseUnitChange={onPurchaseUnitChange}
        conversionFactor={conversionFactor}
        onConversionFactorChange={onConversionFactorChange}
        costPrice={costPrice}
      />
    </FormSection>
  );
}

function InventoryFields({
  unitOfMeasure,
  onUnitOfMeasureChange,
  reorderPoint,
  onReorderPointChange,
  optimalStock,
  onOptimalStockChange,
  leadTimeDays,
  onLeadTimeDaysChange,
  initialStock,
  onInitialStockChange,
  barcode,
  onBarcodeChange,
  oemNumber,
  onOemNumberChange,
}: Pick<
  InventoryBehaviorSectionProps,
  | "unitOfMeasure"
  | "onUnitOfMeasureChange"
  | "reorderPoint"
  | "onReorderPointChange"
  | "optimalStock"
  | "onOptimalStockChange"
  | "leadTimeDays"
  | "onLeadTimeDaysChange"
  | "initialStock"
  | "onInitialStockChange"
  | "barcode"
  | "onBarcodeChange"
  | "oemNumber"
  | "onOemNumberChange"
>) {
  return (
    <>
      <div>
        <FieldLabel>Unit of Measure</FieldLabel>
        <select
          value={unitOfMeasure}
          onChange={(event) => onUnitOfMeasureChange(event.target.value)}
          className={fieldClass}
        >
          {UNITS_OF_MEASURE.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabel>Reorder Point</FieldLabel>
        <input
          type="number"
          min="0"
          value={reorderPoint}
          onChange={(event) => onReorderPointChange(event.target.value)}
          className={fieldClass}
        />
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Reorder alert triggers at this level
        </p>
      </div>
      <div>
        <FieldLabel>Optimal Stock</FieldLabel>
        <input
          type="number"
          min="0"
          value={optimalStock}
          onChange={(event) => onOptimalStockChange(event.target.value)}
          className={fieldClass}
        />
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Target stock level to maintain
        </p>
      </div>
      <div>
        <FieldLabel>Lead Time (Days)</FieldLabel>
        <input
          type="number"
          min="0"
          value={leadTimeDays}
          onChange={(event) => onLeadTimeDaysChange(event.target.value)}
          className={fieldClass}
        />
      </div>
      <div>
        <FieldLabel>Initial Stock</FieldLabel>
        <input
          type="number"
          min="0"
          value={initialStock}
          onChange={(event) => onInitialStockChange(event.target.value)}
          className={fieldClass}
        />
      </div>
      <div className="col-span-2">
        <FieldLabel>Barcode</FieldLabel>
        <input
          type="text"
          value={barcode}
          onChange={(event) => onBarcodeChange(event.target.value.slice(0, 50))}
          placeholder="Auto-generated if empty"
          maxLength={50}
          className={cn(fieldClass, "font-mono")}
        />
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Leave blank to auto-generate a unique barcode
        </p>
      </div>
      <div className="col-span-2">
        <FieldLabel>OEM Number</FieldLabel>
        <input
          type="text"
          value={oemNumber}
          onChange={(event) => onOemNumberChange(event.target.value.slice(0, 100))}
          placeholder="e.g. MB295982, 04465-0K160"
          maxLength={100}
          className={cn(fieldClass, "font-mono")}
        />
      </div>
    </>
  );
}

function PackagingFields({
  unitsPerCase,
  onUnitsPerCaseChange,
  packagingUnit,
  onPackagingUnitChange,
  costPrice,
  unitPrice,
}: Pick<
  InventoryBehaviorSectionProps,
  | "unitsPerCase"
  | "onUnitsPerCaseChange"
  | "packagingUnit"
  | "onPackagingUnitChange"
  | "costPrice"
  | "unitPrice"
>) {
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Packaging
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Units per Case</FieldLabel>
          <input
            type="number"
            min={1}
            value={unitsPerCase}
            onChange={(event) =>
              onUnitsPerCaseChange(parseInt(event.target.value) || 1)
            }
            className={fieldClass}
          />
          <span className="text-[10px] text-muted-foreground">
            {unitsPerCase > 1
              ? `1 ${packagingUnit || "case"} = ${unitsPerCase} pieces`
              : "Sold individually"}
          </span>
        </div>
        <div>
          <FieldLabel>Packaging Unit</FieldLabel>
          <select
            value={packagingUnit ?? ""}
            onChange={(event) => onPackagingUnitChange(event.target.value || null)}
            className={fieldClass}
          >
            <option value="">None (pieces)</option>
            <option value="box">Box</option>
            <option value="case">Case</option>
            <option value="pack">Pack</option>
            <option value="carton">Carton</option>
            <option value="drum">Drum</option>
            <option value="pail">Pail</option>
            <option value="set">Set</option>
          </select>
        </div>
      </div>
      {unitsPerCase > 1 &&
        (parseFloat(costPrice || "0") > 0 ||
          parseFloat(unitPrice || "0") > 0) && (
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {parseFloat(costPrice || "0") > 0 && (
              <div>
                Cost per {packagingUnit || "case"}: {"\u20b1"}
                {(parseFloat(costPrice) * unitsPerCase).toFixed(2)}
              </div>
            )}
            {parseFloat(unitPrice || "0") > 0 && (
              <div>
                Sell per {packagingUnit || "case"}: {"\u20b1"}
                {(parseFloat(unitPrice) * unitsPerCase).toFixed(2)}
              </div>
            )}
          </div>
        )}
    </div>
  );
}

function UnitConversionFields({
  sellingUnit,
  onSellingUnitChange,
  purchaseUnit,
  onPurchaseUnitChange,
  conversionFactor,
  onConversionFactorChange,
  costPrice,
}: Pick<
  InventoryBehaviorSectionProps,
  | "sellingUnit"
  | "onSellingUnitChange"
  | "purchaseUnit"
  | "onPurchaseUnitChange"
  | "conversionFactor"
  | "onConversionFactorChange"
  | "costPrice"
>) {
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Unit of Measure Conversion
      </h4>
      <p className="mb-2 text-[10px] text-muted-foreground">
        For items bought in bulk (rolls, boxes) and sold in smaller units
        (meters, pieces)
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <FieldLabel>Selling Unit</FieldLabel>
          <select
            value={sellingUnit}
            onChange={(event) => onSellingUnitChange(event.target.value)}
            className={fieldClass}
          >
            <option value="piece">Piece</option>
            <option value="meter">Meter</option>
            <option value="foot">Foot</option>
            <option value="liter">Liter</option>
            <option value="kg">Kilogram</option>
            <option value="gram">Gram</option>
            <option value="ml">Milliliter</option>
            <option value="set">Set</option>
            <option value="pair">Pair</option>
          </select>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Unit customers buy in
          </p>
        </div>
        <div>
          <FieldLabel>Purchase Unit</FieldLabel>
          <select
            value={purchaseUnit}
            onChange={(event) => {
              onPurchaseUnitChange(event.target.value);
              if (!event.target.value) onConversionFactorChange("1");
            }}
            className={fieldClass}
          >
            <option value="">Same as selling unit</option>
            <option value="roll">Roll</option>
            <option value="box">Box</option>
            <option value="pack">Pack</option>
            <option value="case">Case</option>
            <option value="drum">Drum</option>
            <option value="bag">Bag</option>
            <option value="bundle">Bundle</option>
            <option value="spool">Spool</option>
            <option value="carton">Carton</option>
          </select>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Unit suppliers sell in
          </p>
        </div>
        <div>
          <FieldLabel>Conversion Factor</FieldLabel>
          <input
            type="number"
            min="1"
            step="1"
            value={conversionFactor}
            onChange={(event) => onConversionFactorChange(event.target.value)}
            disabled={!purchaseUnit}
            className={cn(fieldClass, !purchaseUnit && "opacity-50")}
          />
          {purchaseUnit && parseFloat(conversionFactor) > 1 && (
            <p className="mt-0.5 text-[10px] font-medium text-primary">
              1 {purchaseUnit} = {conversionFactor} {sellingUnit}s
            </p>
          )}
        </div>
      </div>
      {purchaseUnit &&
        parseFloat(conversionFactor) > 1 &&
        parseFloat(costPrice || "0") > 0 && (
          <div className="mt-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            Cost per {purchaseUnit}: {"\u20b1"}
            {(
              parseFloat(costPrice || "0") * parseFloat(conversionFactor)
            ).toFixed(2)}
            {" \u2192 "}Cost per {sellingUnit}: {"\u20b1"}
            {parseFloat(costPrice || "0").toFixed(2)}
          </div>
        )}
    </div>
  );
}
