/**
 * ZPL Label Builder for Zebra ZD230 printer.
 * Generates ZPL II commands for shelf/barcode labels.
 *
 * Default: 50mm x 30mm label at 8 dpmm (203 dpi).
 */

interface LabelData {
  itemName: string;
  barcode: string | null;
  costCode?: string;
  supplierCode?: string;
}

/**
 * Build a shelf label ZPL string.
 * Layout: item name (top), barcode (center), cost code (bottom).
 */
export function buildShelfLabel(data: LabelData): string {
  const name = data.itemName.slice(0, 40); // Truncate for label width
  const barcode = data.barcode || '';
  const costLine = [data.supplierCode, data.costCode].filter(Boolean).join(' ');

  let zpl = '^XA\n'; // Start label
  zpl += '^CF0,20\n'; // Default font, 20pt

  // Item name (top, centered)
  zpl += `^FO10,10^FB380,2,0,C,0^FD${escapeZpl(name)}^FS\n`;

  // Barcode (center)
  if (barcode) {
    zpl += '^FO30,60^BY2,2,60\n'; // Bar code defaults
    zpl += `^BCN,60,Y,N,N^FD${escapeZpl(barcode)}^FS\n`; // Code 128
  }

  // Cost code / supplier (bottom)
  if (costLine) {
    zpl += `^FO10,140^CF0,16^FD${escapeZpl(costLine)}^FS\n`;
  }

  zpl += '^XZ\n'; // End label
  return zpl;
}

/**
 * Convert ZPL string to Uint8Array for BLE transmission.
 */
export function zplToBytes(zpl: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(zpl);
}

/**
 * Escape special ZPL characters.
 */
function escapeZpl(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~');
}
