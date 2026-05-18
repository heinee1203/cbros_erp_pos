import { computeItemDiff, parseYN, sanitizeText } from "./diff-utils";
import type { ExistingImportProduct } from "./item-preview-context";
import {
  type LoyverseColumnIndex,
  getCellByIndex,
  isExcelDamagedBarcode,
  isExcelDamagedSku,
  parseBrandNameFromCategory,
  parseImportPrices,
  parseLoyverseRowLocation,
} from "./loyverse-utils";
import type { LocationMapping, ParsedRow, ParsedRowLocation, RowAction } from "./types";

export interface ParseLoyverseItemRowOptions {
  row: string[];
  rowNum: number;
  colIdx: LoyverseColumnIndex;
  headerIdx: Record<string, number>;
  locationMapping: LocationMapping[];
  skuMap: Map<string, ExistingImportProduct>;
  existingStockMap: Map<string, Map<string, number>>;
  existingVariantOptionMap: Map<string, Array<{ typeName: string; value: string }>>;
}

export interface ParseLoyverseItemRowsOptions
  extends Omit<ParseLoyverseItemRowOptions, "row" | "rowNum"> {
  rows: string[][];
}

function formatPrice(value: number): string {
  return isNaN(value) ? "0.00" : value.toFixed(2);
}

export function parseLoyverseItemRow(options: ParseLoyverseItemRowOptions): ParsedRow {
  const {
    row,
    rowNum,
    colIdx,
    headerIdx,
    locationMapping,
    skuMap,
    existingStockMap,
    existingVariantOptionMap,
  } = options;

  const name = getCellByIndex(row, colIdx.name);
  const rawSku = getCellByIndex(row, colIdx.sku);
  // SKUs in scientific notation have already lost precision in Excel.
  const sku = rawSku && isExcelDamagedSku(rawSku) ? "" : rawSku;
  const rawBarcode = getCellByIndex(row, colIdx.barcode);
  // Barcode precision cannot be recovered, so preserve the current DB value.
  const barcode = rawBarcode && isExcelDamagedBarcode(rawBarcode) ? "" : rawBarcode;
  const costStr = getCellByIndex(row, colIdx.cost);
  const priceStr = getCellByIndex(row, colIdx.price);
  const categoryName = getCellByIndex(row, colIdx.category);
  const brandName = parseBrandNameFromCategory(categoryName);
  const description = getCellByIndex(row, colIdx.description);
  const handle = getCellByIndex(row, colIdx.handle);
  const option1Name = getCellByIndex(row, colIdx.option1Name);
  const option1Value = getCellByIndex(row, colIdx.option1Value);
  const option2Name = getCellByIndex(row, colIdx.option2Name);
  const option2Value = getCellByIndex(row, colIdx.option2Value);
  const option3Name = getCellByIndex(row, colIdx.option3Name);
  const option3Value = getCellByIndex(row, colIdx.option3Value);

  const active = parseYN(getCellByIndex(row, colIdx.active));
  const sellingUnit = sanitizeText(getCellByIndex(row, colIdx.unit));
  const trackSerial = parseYN(getCellByIndex(row, colIdx.trackSerial));
  const trackDot = parseYN(getCellByIndex(row, colIdx.trackDot));
  const specialOrder = parseYN(getCellByIndex(row, colIdx.specialOrder));
  const oemNumber = sanitizeText(getCellByIndex(row, colIdx.oemNumber));
  const supplierName = sanitizeText(getCellByIndex(row, colIdx.supplier));

  const rowErrors: string[] = [];
  if (!sku) {
    if (rawSku && isExcelDamagedSku(rawSku)) {
      rowErrors.push(`SKU "${rawSku}" is in scientific notation (Excel damage). Re-export the CSV directly from Loyverse without opening in Excel.`);
    } else {
      rowErrors.push("SKU is required");
    }
  }

  const priceResult = parseImportPrices(costStr, priceStr);
  const { isVariablePrice, costPrice, unitPrice } = priceResult;
  rowErrors.push(...priceResult.errors);

  const rowLocations: ParsedRowLocation[] = locationMapping.map((mapping) =>
    parseLoyverseRowLocation(mapping, headerIdx, row),
  );

  const existing = sku ? skuMap.get(sku.toLowerCase()) : null;
  let action: RowAction;
  let changes: string[];
  if (!existing) {
    action = "CREATE";
    changes = [];
  } else {
    changes = computeItemDiff(
      {
        name: existing.name,
        unitPrice: existing.unitPrice,
        costPrice: existing.costPrice,
        barcode: existing.barcode,
        categoryName: existing.categoryName,
      },
      {
        name,
        unitPrice: formatPrice(unitPrice),
        costPrice: formatPrice(costPrice),
        barcode,
        categoryName,
        isVariant: false,
        option1Name,
        option1Value,
        option2Name,
        option2Value,
        option3Name,
        option3Value,
        locations: rowLocations,
      },
      existingStockMap.get(existing.id) ?? new Map(),
      existingVariantOptionMap.get(existing.id) ?? [],
    );
    action = changes.length > 0 ? "UPDATE" : "NO_CHANGE";
  }

  return {
    rowIndex: rowNum,
    name,
    sku,
    barcode,
    costPrice: formatPrice(costPrice),
    unitPrice: formatPrice(unitPrice),
    isVariablePrice,
    categoryName,
    brandName,
    description,
    handle,
    option1Name,
    option1Value,
    option2Name,
    option2Value,
    option3Name,
    option3Value,
    resolvedName: name,
    isVariant: false,
    parentName: "",
    active,
    sellingUnit,
    trackSerial,
    trackDot,
    specialOrder,
    oemNumber,
    supplierName,
    locations: rowLocations,
    action,
    existingProductId: existing?.id ?? null,
    changes,
    errors: rowErrors,
  };
}

export function parseLoyverseItemRows(options: ParseLoyverseItemRowsOptions): ParsedRow[] {
  const parsedRows: ParsedRow[] = [];

  for (let i = 1; i < options.rows.length; i++) {
    parsedRows.push(
      parseLoyverseItemRow({
        ...options,
        row: options.rows[i],
        rowNum: i + 1,
      }),
    );
  }

  return parsedRows;
}
