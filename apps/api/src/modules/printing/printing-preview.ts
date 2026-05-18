export function buildLabelaryUrl(
  widthMm: number,
  heightMm: number,
  dpmm: number,
): string {
  const widthIn = (widthMm / 25.4).toFixed(2);
  const heightIn = (heightMm / 25.4).toFixed(2);

  return `http://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/0/`;
}

export function toPngDataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
