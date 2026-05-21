/**
 * ZPL label templates for CBROS Auto Parts shelf/barcode labels.
 * All physical positions are expressed in millimeters and converted by
 * ZplBuilder using the label's dpmm setting.
 */

import { ZplBuilder, type ZplLabelConfig } from "./zpl-builder.js";

export type ShelfLabelSizeId = "50x30" | "50x40" | "100x70";

/** 50 x 30mm: compact shelf label for dense bins. */
export const LABEL_50x30: ZplLabelConfig = {
  widthMm: 50,
  heightMm: 30,
  dpmm: 8,
  darkness: 15,
  speed: 4,
};

/** 50 x 40mm: taller label with a SKU/detail line. */
export const LABEL_50x40: ZplLabelConfig = {
  widthMm: 50,
  heightMm: 40,
  dpmm: 8,
  darkness: 15,
  speed: 4,
};

/** 100 x 70mm: large receiving/box label. */
export const LABEL_100x70: ZplLabelConfig = {
  widthMm: 100,
  heightMm: 70,
  dpmm: 8,
  darkness: 15,
  speed: 4,
};

export interface ShelfLabelPreset {
  id: ShelfLabelSizeId;
  label: string;
  config: ZplLabelConfig;
}

export const SHELF_LABEL_PRESETS: ShelfLabelPreset[] = [
  { id: "50x30", label: "50x30mm", config: LABEL_50x30 },
  { id: "50x40", label: "50x40mm", config: LABEL_50x40 },
  { id: "100x70", label: "100x70mm", config: LABEL_100x70 },
];

/**
 * Encode a cost price as a KINGSCOBRA mnemonic.
 * K=1 I=2 N=3 G=4 S=5 C=6 O=7 B=8 R=9 A=0
 * Example: 1000 -> "KAAA", 5029 -> "SACR".
 */
export function encodeCostMnemonic(costPrice: number): string {
  if (!costPrice || costPrice <= 0) return "";
  const keyword = "KINGSCOBRA";
  return Math.round(costPrice)
    .toString()
    .split("")
    .map((digit) => {
      const n = parseInt(digit, 10);
      return n === 0 ? keyword[9] : keyword[n - 1];
    })
    .join("");
}

export interface ShelfLabelData {
  /** Full item name, for example "FORD TENSIONER BEARING YF09-12-700". */
  itemName: string;
  /** Barcode payload: EAN/UPC/internal barcode. */
  barcodeData: string;
  /** Force a barcode language if auto-detection is not desired. */
  barcodeType?: "ean13" | "upca" | "code128";
  /** Optional SKU or mnemonic code displayed on taller labels. */
  sku?: string | null;
  /** Optional detail line, commonly brand plus SKU. */
  detailText?: string | null;
  /** Cost price in pesos, encoded as a KINGSCOBRA mnemonic. */
  costPrice?: number;
  /** Short supplier abbreviation appended to the cost mnemonic. */
  supplierCode?: string;
  /** Print quantity, default 1. */
  quantity?: number;
}

type ShelfBarcodeFormat = "ean13" | "upca" | "code128";

type ShelfObjectBase = {
  id: "itemName" | "detailText" | "barcode" | "costCode" | "date";
  label: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};

export type ShelfLabelPreviewObject =
  | (ShelfObjectBase & {
      kind: "text";
      text: string;
      font: string;
      fontHeight: number;
      fontWidth: number;
      maxLines?: number;
      alignment?: "L" | "C" | "R" | "J";
      weight?: "normal" | "bold";
    })
  | (ShelfObjectBase & {
      kind: "barcode";
      data: string;
      format: ShelfBarcodeFormat;
      heightDots: number;
      moduleWidth: number;
      showText: boolean;
    });

export interface ShelfLabelPreviewModel {
  sizeId: ShelfLabelSizeId;
  widthMm: number;
  heightMm: number;
  dpmm: number;
  objects: ShelfLabelPreviewObject[];
}

type LayoutSpec = {
  name: Omit<Extract<ShelfLabelPreviewObject, { kind: "text" }>, "text">;
  detail?: Omit<Extract<ShelfLabelPreviewObject, { kind: "text" }>, "text">;
  barcode: Omit<Extract<ShelfLabelPreviewObject, { kind: "barcode" }>, "data" | "format">;
  cost: Omit<Extract<ShelfLabelPreviewObject, { kind: "text" }>, "text">;
  date: Omit<Extract<ShelfLabelPreviewObject, { kind: "text" }>, "text">;
};

const LAYOUTS: Record<ShelfLabelSizeId, LayoutSpec> = {
  "50x30": {
    name: {
      id: "itemName",
      kind: "text",
      label: "Item name",
      xMm: 2,
      yMm: 1.5,
      widthMm: 46,
      heightMm: 8,
      font: "0",
      fontHeight: 23,
      fontWidth: 19,
      maxLines: 2,
      alignment: "L",
      weight: "bold",
    },
    barcode: {
      id: "barcode",
      kind: "barcode",
      label: "Barcode",
      xMm: 4,
      yMm: 10.5,
      widthMm: 42,
      heightMm: 13,
      heightDots: 70,
      moduleWidth: 2,
      showText: true,
    },
    cost: {
      id: "costCode",
      kind: "text",
      label: "Cost code",
      xMm: 2,
      yMm: 24.5,
      widthMm: 22,
      heightMm: 4,
      font: "T",
      fontHeight: 28,
      fontWidth: 20,
      maxLines: 1,
      alignment: "L",
      weight: "bold",
    },
    date: {
      id: "date",
      kind: "text",
      label: "Print date",
      xMm: 24,
      yMm: 24.5,
      widthMm: 24,
      heightMm: 4,
      font: "S",
      fontHeight: 24,
      fontWidth: 17,
      maxLines: 1,
      alignment: "R",
      weight: "bold",
    },
  },
  "50x40": {
    name: {
      id: "itemName",
      kind: "text",
      label: "Item name",
      xMm: 2,
      yMm: 1.5,
      widthMm: 46,
      heightMm: 9.5,
      font: "0",
      fontHeight: 25,
      fontWidth: 20,
      maxLines: 2,
      alignment: "L",
      weight: "bold",
    },
    detail: {
      id: "detailText",
      kind: "text",
      label: "Detail line",
      xMm: 2,
      yMm: 10.8,
      widthMm: 46,
      heightMm: 3.6,
      font: "S",
      fontHeight: 17,
      fontWidth: 13,
      maxLines: 1,
      alignment: "L",
    },
    barcode: {
      id: "barcode",
      kind: "barcode",
      label: "Barcode",
      xMm: 4,
      yMm: 15,
      widthMm: 42,
      heightMm: 16,
      heightDots: 85,
      moduleWidth: 2,
      showText: true,
    },
    cost: {
      id: "costCode",
      kind: "text",
      label: "Cost code",
      xMm: 2,
      yMm: 34.5,
      widthMm: 22,
      heightMm: 4,
      font: "T",
      fontHeight: 29,
      fontWidth: 21,
      maxLines: 1,
      alignment: "L",
      weight: "bold",
    },
    date: {
      id: "date",
      kind: "text",
      label: "Print date",
      xMm: 24,
      yMm: 34.5,
      widthMm: 24,
      heightMm: 4,
      font: "S",
      fontHeight: 25,
      fontWidth: 18,
      maxLines: 1,
      alignment: "R",
      weight: "bold",
    },
  },
  "100x70": {
    name: {
      id: "itemName",
      kind: "text",
      label: "Item name",
      xMm: 4,
      yMm: 3.5,
      widthMm: 92,
      heightMm: 18,
      font: "0",
      fontHeight: 47,
      fontWidth: 39,
      maxLines: 3,
      alignment: "L",
      weight: "bold",
    },
    detail: {
      id: "detailText",
      kind: "text",
      label: "Detail line",
      xMm: 4,
      yMm: 21.5,
      widthMm: 92,
      heightMm: 6,
      font: "0",
      fontHeight: 31,
      fontWidth: 24,
      maxLines: 1,
      alignment: "L",
      weight: "bold",
    },
    barcode: {
      id: "barcode",
      kind: "barcode",
      label: "Barcode",
      xMm: 17,
      yMm: 29,
      widthMm: 66,
      heightMm: 24,
      heightDots: 160,
      moduleWidth: 3,
      showText: true,
    },
    cost: {
      id: "costCode",
      kind: "text",
      label: "Cost code",
      xMm: 4,
      yMm: 58,
      widthMm: 38,
      heightMm: 8,
      font: "0",
      fontHeight: 58,
      fontWidth: 44,
      maxLines: 1,
      alignment: "L",
      weight: "bold",
    },
    date: {
      id: "date",
      kind: "text",
      label: "Print date",
      xMm: 45,
      yMm: 59,
      widthMm: 51,
      heightMm: 7,
      font: "0",
      fontHeight: 50,
      fontWidth: 36,
      maxLines: 1,
      alignment: "R",
      weight: "bold",
    },
  },
};

export function buildShelfLabel(
  data: ShelfLabelData,
  config?: ZplLabelConfig,
): string {
  const cfg = { ...(config ?? LABEL_50x30), quantity: data.quantity ?? 1 };
  const zpl = new ZplBuilder(cfg);
  const model = buildShelfLabelPreviewModel(data, cfg);

  zpl.startLabel();

  for (const object of model.objects) {
    if (object.kind === "text") {
      if (!object.text) continue;
      zpl.text(object.xMm, object.yMm, object.text, {
        font: object.font,
        fontHeight: object.fontHeight,
        fontWidth: object.fontWidth,
        maxWidth: object.widthMm,
        maxLines: object.maxLines,
        alignment: object.alignment,
      });
      continue;
    }

    if (!object.data) continue;

    if (object.format === "ean13") {
      zpl.ean13(object.xMm, object.yMm, object.data, {
        height: object.heightDots,
        moduleWidth: object.moduleWidth,
        showText: object.showText,
      });
    } else if (object.format === "upca") {
      zpl.upcA(object.xMm, object.yMm, object.data, {
        height: object.heightDots,
        moduleWidth: object.moduleWidth,
        showText: object.showText,
      });
    } else {
      zpl.barcode128(object.xMm, object.yMm, object.data, {
        height: object.heightDots,
        moduleWidth: object.moduleWidth,
        showText: object.showText,
      });
    }
  }

  zpl.endLabel();
  return zpl.build();
}

export function buildShelfLabelPreviewModel(
  data: ShelfLabelData,
  config?: ZplLabelConfig,
  now = new Date(),
): ShelfLabelPreviewModel {
  const cfg = config ?? LABEL_50x30;
  const sizeId = getShelfLabelSizeId(cfg);
  const layout = LAYOUTS[sizeId];
  const itemName = normalizeLabelText(data.itemName || "APEX POS ITEM")
    .toUpperCase()
    .slice(0, 96);
  const barcodeData = normalizeBarcodeValue(data.barcodeData);
  const barcodeFormat = resolveBarcodeFormat(barcodeData, data.barcodeType);
  const detailText = normalizeLabelText(
    data.detailText ?? data.sku ?? "",
  ).toUpperCase();
  const costCode = data.costPrice ? encodeCostMnemonic(data.costPrice) : "";
  const supplierSuffix = normalizeLabelText(data.supplierCode ?? "")
    .toUpperCase()
    .slice(0, 4);
  const fullCostCode = costCode ? `${costCode}${supplierSuffix}` : "";
  const dateStr = formatLabelDate(now);

  const objects: ShelfLabelPreviewObject[] = [
    { ...layout.name, text: itemName },
  ];

  if (layout.detail && detailText) {
    objects.push({ ...layout.detail, text: detailText });
  }

  if (barcodeData) {
    objects.push({ ...layout.barcode, data: barcodeData, format: barcodeFormat });
  }

  if (fullCostCode) {
    objects.push({ ...layout.cost, text: fullCostCode });
  }

  objects.push({ ...layout.date, text: dateStr });

  return {
    sizeId,
    widthMm: cfg.widthMm,
    heightMm: cfg.heightMm,
    dpmm: cfg.dpmm,
    objects,
  };
}

/**
 * Concatenate multiple ZPL label strings into a single print job.
 * Each ^XA...^XZ block is a separate label printed sequentially.
 */
export function batchLabels(zplStrings: string[]): string {
  return zplStrings.join("\n");
}

function getShelfLabelSizeId(config: ZplLabelConfig): ShelfLabelSizeId {
  if (config.widthMm >= 95 && config.heightMm >= 65) return "100x70";
  if (config.widthMm === 50 && config.heightMm >= 38) return "50x40";
  return "50x30";
}

function normalizeLabelText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBarcodeValue(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\x00-\x1f\x7f^~\\]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 48);
}

function resolveBarcodeFormat(
  barcodeData: string,
  forced?: ShelfLabelData["barcodeType"],
): ShelfBarcodeFormat {
  if (forced) return forced;
  if (/^\d{13}$/.test(barcodeData)) return "ean13";
  if (/^\d{12}$/.test(barcodeData)) return "upca";
  return "code128";
}

function formatLabelDate(now: Date): string {
  return now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}
