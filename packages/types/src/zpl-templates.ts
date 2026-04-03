/**
 * ZPL Label Templates — predefined label layouts for CBROS Auto Parts.
 * All templates use the ZplBuilder class for type-safe ZPL generation.
 */

import { ZplBuilder, type ZplLabelConfig } from "./zpl-builder.js";

/* ─── Standard Label Sizes ─── */

/** 50 x 30mm — standard shelf label (Zebra ZD230) */
export const LABEL_50x30: ZplLabelConfig = {
  widthMm: 50,
  heightMm: 30,
  dpmm: 8,
  darkness: 15,
  speed: 4,
};

/** 50 x 40mm — medium label */
export const LABEL_50x40: ZplLabelConfig = {
  widthMm: 50,
  heightMm: 40,
  dpmm: 8,
  darkness: 15,
  speed: 4,
};

/** 100 x 70mm — large label */
export const LABEL_100x70: ZplLabelConfig = {
  widthMm: 100,
  heightMm: 70,
  dpmm: 8,
  darkness: 15,
  speed: 4,
};

/* ─── Helpers ─── */

/**
 * Encode a cost price as a KINGSCOBRA mnemonic.
 * K=1 I=2 N=3 G=4 S=5 C=6 O=7 B=8 R=9 A=0
 * e.g. 1000 → "KAAA", 5029 → "SACR"
 */
export function encodeCostMnemonic(costPrice: number): string {
  if (!costPrice || costPrice <= 0) return "";
  const keyword = "KINGSCOBRA";
  return Math.round(costPrice)
    .toString()
    .split("")
    .map((d) => {
      const n = parseInt(d);
      return n === 0 ? keyword[9] : keyword[n - 1];
    })
    .join("");
}

/* ─── Template: Shelf Price Label ─── */

export interface ShelfLabelData {
  /** Full item name e.g. "FORD TENS BEARING YF09-12-700 ESCAPE 2.0" */
  itemName: string;
  /** Barcode data — EAN/UPC number or internal barcode */
  barcodeData: string;
  /** Barcode type: 'ean13' | 'code128' — auto-detected if omitted */
  barcodeType?: "ean13" | "code128";
  /** Cost price in pesos — encoded as KINGSCOBRA mnemonic on label */
  costPrice?: number;
  /** Short supplier abbreviation appended to cost mnemonic e.g. "SW" */
  supplierCode?: string;
  /** Print quantity, default 1 */
  quantity?: number;
}

export function buildShelfLabel(
  data: ShelfLabelData,
  config?: ZplLabelConfig,
): string {
  const cfg = { ...(config ?? LABEL_50x30), quantity: data.quantity ?? 1 };
  const zpl = new ZplBuilder(cfg);

  const barcodeValue = data.barcodeData || "";
  const costCode = data.costPrice
    ? encodeCostMnemonic(data.costPrice)
    : "";
  const supplierSuffix = data.supplierCode ?? "";
  const fullCostCode = costCode ? `${costCode}${supplierSuffix}` : "";
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  zpl.startLabel();

  // ROW 1: Item Name — Font 0, 24×20, word-wrap 2 lines
  zpl.text(1, 1, data.itemName.toUpperCase(), {
    font: "0",
    fontHeight: 24,
    fontWidth: 20,
    maxWidth: cfg.widthMm - 2,
    maxLines: 2,
    alignment: "L",
  });

  // ROW 2: Barcode — EAN-13 default for 12-13 digit numeric, Code 128 fallback
  if (barcodeValue.length > 0) {
    const isEan = /^\d{12,13}$/.test(barcodeValue) && data.barcodeType !== "code128";

    if (isEan) {
      // EAN-13: pass only 12 digits, printer calculates check digit
      const eanData = barcodeValue.length === 13 ? barcodeValue.slice(0, 12) : barcodeValue;
      zpl.ean13(1, 10, eanData, {
        height: 88,
        moduleWidth: 3,
        showText: true,
      });
    } else {
      zpl.barcode128(1, 10, barcodeValue, {
        height: 70,
        moduleWidth: 2,
        showText: true,
      });
    }
  }

  // ROW 3: Cost code (Font T, left) + Date (Font S, right)
  const bottomY = cfg.heightMm - 5;

  if (fullCostCode) {
    zpl.text(1, bottomY, fullCostCode, {
      font: "T",
      fontHeight: 28,
      fontWidth: 20,
    });
  }

  zpl.text(1, bottomY, dateStr, {
    font: "S",
    fontHeight: 25,
    fontWidth: 18,
    maxWidth: cfg.widthMm - 2,
    maxLines: 1,
    alignment: "R",
  });

  zpl.endLabel();
  return zpl.build();
}

/* ─── Batch: Concatenate multiple labels ─── */

/**
 * Concatenate multiple ZPL label strings into a single print job.
 * Each ^XA...^XZ block is a separate label — the printer prints them sequentially.
 */
export function batchLabels(zplStrings: string[]): string {
  return zplStrings.join("\n");
}
