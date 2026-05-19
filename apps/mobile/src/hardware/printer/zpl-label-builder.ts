/**
 * ZPL Label Builder for Zebra ZD230 printer.
 * Generates ZPL II commands for shelf/barcode labels.
 *
 * Default: 50mm x 30mm label at 8 dpmm (203 dpi).
 */

interface LabelData {
  itemName: string;
  barcode: string | null;
  price?: number | string | null;
  sku?: string | null;
  costCode?: string;
  supplierCode?: string;
}

interface AuthorizationBadgeData {
  credential: string;
  fullName?: string | null;
  role?: string | null;
  locationName?: string | null;
}

/**
 * Build a shelf label ZPL string.
 * Layout: item name (top), barcode (center), cost code (bottom).
 */
export function buildShelfLabel(data: LabelData): string {
  const name = normalizeLabelText(data.itemName || 'APEX POS ITEM').slice(0, 48);
  const barcode = normalizeBarcodeValue(data.barcode);
  const sku = normalizeLabelText(data.sku ?? '');
  const costLine = [data.supplierCode, data.costCode].map(normalizeLabelText).filter(Boolean).join(' ');
  const priceLine = data.price != null && data.price !== ''
    ? formatLabelPrice(data.price)
    : '';

  let zpl = '^XA\n'; // Start label
  zpl += '^CF0,20\n'; // Default font, 20pt

  // Item name (top, centered)
  zpl += `^FO10,10^FB380,2,0,C,0^FD${escapeZpl(name)}^FS\n`;

  // Barcode (center)
  if (barcode) {
    zpl += '^FO30,60^BY2,2,60\n'; // Bar code defaults
    zpl += `^BCN,60,Y,N,N^FD${escapeZpl(barcode)}^FS\n`; // Code 128
  }

  if (sku || priceLine) {
    const detailLine = [sku, priceLine].filter(Boolean).join('  ');
    zpl += `^FO10,130^FB380,1,0,C,0^CF0,18^FD${escapeZpl(detailLine)}^FS\n`;
  }

  // Cost code / supplier (bottom)
  if (costLine) {
    zpl += `^FO10,155^CF0,16^FD${escapeZpl(costLine)}^FS\n`;
  }

  zpl += '^XZ\n'; // End label
  return zpl;
}

export function buildAuthorizationBadgeLabel(data: AuthorizationBadgeData): string {
  const credential = normalizeBarcodeValue(data.credential);
  const name = normalizeLabelText(data.fullName || 'MANAGER');
  const role = normalizeLabelText(data.role || 'MANAGER');
  const location = normalizeLabelText(data.locationName || 'APEX POS');
  const detailLine = [role, location].filter(Boolean).join('  ');

  let zpl = '^XA\n';
  zpl += '^CF0,20\n';
  zpl += '^FO10,10^FB380,1,0,C,0^FDAUTHORIZATION BADGE^FS\n';
  zpl += `^FO10,38^FB380,1,0,C,0^CF0,18^FD${escapeZpl(name)}^FS\n`;
  zpl += '^FO30,66^BY2,2,64\n';
  zpl += `^BCN,64,Y,N,N^FD${escapeZpl(credential)}^FS\n`;
  zpl += `^FO10,142^FB380,1,0,C,0^CF0,16^FD${escapeZpl(detailLine)}^FS\n`;
  zpl += '^FO10,164^FB380,1,0,C,0^CF0,14^FDAPEX POS MANAGER APPROVAL^FS\n';
  zpl += '^XZ\n';
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

export function normalizeLabelText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeBarcodeValue(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f^~\\]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 48);
}

function formatLabelPrice(value: number | string): string {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return `PHP ${parsed.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
