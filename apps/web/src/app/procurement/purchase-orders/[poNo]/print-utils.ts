/** Print a PO receiving slip for a specific receipt */
export function printReceivingSlip(receipt: any, po: any) {
  const w = window.open("", "_blank");
  if (!w) return;

  const itemRows = (receipt.lines || []).map((line: any, i: number) => `
    <tr>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:center">${i + 1}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc">${line.parentName ? line.parentName + " (" + line.productName + ")" : line.productName || "\u2014"}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;font-family:monospace;font-size:10px">${line.sku || line.mnemonicSku || "\u2014"}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right">${line.receivedAcceptedQty ?? 0}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;${(line.rejectedQty ?? 0) > 0 ? "color:#dc2626;font-weight:bold" : ""}">${line.rejectedQty ?? 0}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;font-size:10px">\u20B1${parseFloat(line.unitCost ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
    </tr>`).join("");

  const receiptAmount = (receipt.lines || []).reduce((sum: number, l: any) =>
    sum + ((l.receivedAcceptedQty ?? 0) * parseFloat(l.unitCost ?? "0")), 0);

  const dateStr = receipt.createdAt
    ? new Date(receipt.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "\u2014";

  const html = `<!DOCTYPE html>
<html><head><title>Receiving Slip \u2014 ${po.poNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:11px;padding:20px;color:#000;max-width:800px;margin:0 auto}
.hdr{text-align:center;border-top:3px double #000;border-bottom:3px double #000;padding:10px 0;margin-bottom:16px}
.hdr h1{font-size:15px;letter-spacing:2px;margin-bottom:2px}
.hdr h2{font-size:10px;font-weight:normal;color:#444}
.meta{margin-bottom:14px;line-height:1.7}
.mr{display:flex}.ml{display:inline-block;width:90px;font-weight:bold;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
th{text-align:left;border-bottom:2px solid #000;padding:3px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.tot{margin:10px 0;padding-top:6px;border-top:2px solid #000;line-height:1.6}
.tot .amt{font-size:13px;font-weight:bold;margin-top:4px}
.disc{margin:16px 0;padding:10px;border:1px solid #999}
.disc h3{font-size:11px;margin-bottom:8px;letter-spacing:1px}
.cb{display:inline-block;width:14px;height:14px;border:1.5px solid #000;margin-right:6px;vertical-align:middle}
.cbr{margin-bottom:4px;font-size:11px}
.nl{border-bottom:1px solid #000;width:100%;height:20px;margin-top:8px}
.sig{margin-top:24px}
.sig h3{font-size:11px;margin-bottom:14px;letter-spacing:1px}
.sl{border-bottom:1px solid #000;width:220px;display:inline-block;margin-right:16px}
.dl{border-bottom:1px solid #000;width:120px;display:inline-block}
.slbl{font-size:9px;color:#666;margin-top:2px;padding-left:40px}
.ftr{border-top:3px double #000;margin-top:20px;padding-top:6px;text-align:center;font-size:9px;color:#666}
@media print{body{padding:0}@page{margin:15mm;size:A4}}
</style></head><body>
<div class="hdr"><h1>PO RECEIVING SLIP</h1><h2>Attach to Supplier Delivery Receipt</h2></div>
<div class="meta">
  <div class="mr"><span class="ml">PO No:</span>${po.poNo}</div>
  <div class="mr"><span class="ml">DR No:</span>${receipt.supplierDrNo || "\u2014"}</div>
  <div class="mr"><span class="ml">Supplier:</span>${po.supplier?.name || "\u2014"}</div>
  <div class="mr"><span class="ml">Received at:</span>${po.destination?.name || "\u2014"}${po.destination?.code ? " (" + po.destination.code + ")" : ""}</div>
  <div class="mr"><span class="ml">Date:</span>${dateStr}</div>
  <div class="mr"><span class="ml">Received by:</span>${receipt.receivedByName || receipt.receivedBy || "\u2014"}</div>
</div>
<h3 style="font-size:11px;letter-spacing:1px;margin-bottom:4px">ITEMS RECEIVED</h3>
<table><thead><tr>
  <th style="width:30px;text-align:center">#</th><th>Item</th><th>SKU</th>
  <th style="width:55px;text-align:right">Accepted</th>
  <th style="width:55px;text-align:right">Rejected</th>
  <th style="width:65px;text-align:right">Unit Cost</th>
</tr></thead><tbody>${itemRows}</tbody></table>
<div class="tot">
  <div>Total: ${receipt.lineCount ?? receipt.lines?.length ?? 0} lines, ${receipt.totalAcceptedQty ?? 0} accepted${(receipt.totalRejectedQty ?? 0) > 0 ? ", " + receipt.totalRejectedQty + " rejected" : ""}</div>
  <div class="amt">Receipt Amount: \u20B1${receiptAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
</div>
<div class="disc">
  <h3>DISCREPANCIES</h3>
  <div class="cbr"><span class="cb"></span> All items match DR</div>
  <div class="cbr"><span class="cb"></span> Short delivery</div>
  <div class="cbr"><span class="cb"></span> Damaged items</div>
  <div class="cbr"><span class="cb"></span> Wrong items</div>
  <div style="margin-top:8px">Notes:</div><div class="nl"></div><div class="nl"></div>
</div>
<div class="sig"><h3>ACKNOWLEDGMENT</h3>
  <div style="margin-bottom:20px">Checked by: <span class="sl"></span> Date: <span class="dl"></span>
    <div class="slbl">(Warehouse Staff)</div>
  </div>
</div>
<div class="ftr">Printed: ${new Date().toLocaleString("en-PH")} \u2014 CBROS Genuine Autoparts & Accessories, Inc.</div>
</body></html>`;

  w.document.write(html);
  w.document.close();
}

/** Batch print all receipts for a PO — one page per receipt with CSS page breaks */
export function printAllReceivingSlips(receipts: any[], po: any) {
  if (receipts.length === 0) return;
  const w = window.open("", "_blank");
  if (!w) return;

  const totalReceipts = receipts.length;
  const slipPages = receipts.map((receipt: any, pageIndex: number) => {
    const itemRows = (receipt.lines || []).map((line: any, i: number) => `
      <tr>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:center">${i + 1}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc">${line.parentName ? line.parentName + " (" + line.productName + ")" : line.productName || "\u2014"}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;font-family:monospace;font-size:10px">${line.sku || line.mnemonicSku || "\u2014"}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right">${line.receivedAcceptedQty ?? 0}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;${(line.rejectedQty ?? 0) > 0 ? "color:#dc2626;font-weight:bold" : ""}">${line.rejectedQty ?? 0}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #ccc;text-align:right;font-size:10px">\u20B1${parseFloat(line.unitCost ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
      </tr>`).join("");

    const receiptAmount = (receipt.lines || []).reduce((sum: number, l: any) =>
      sum + ((l.receivedAcceptedQty ?? 0) * parseFloat(l.unitCost ?? "0")), 0);
    const totalAccepted = receipt.totalAcceptedQty ?? (receipt.lines || []).reduce((s: number, l: any) => s + (l.receivedAcceptedQty ?? 0), 0);
    const totalRejected = receipt.totalRejectedQty ?? (receipt.lines || []).reduce((s: number, l: any) => s + (l.rejectedQty ?? 0), 0);
    const dateStr = receipt.createdAt
      ? new Date(receipt.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
      : "\u2014";

    return `<div class="slip${pageIndex > 0 ? " page-break" : ""}">
<div class="hdr"><h1>PO RECEIVING SLIP</h1><h2>Attach to Supplier Delivery Receipt</h2>${totalReceipts > 1 ? `<div style="font-size:10px;color:#666;margin-top:4px">Receipt ${pageIndex + 1} of ${totalReceipts}</div>` : ""}</div>
<div class="meta">
  <div class="mr"><span class="ml">PO No:</span>${po.poNo}</div>
  <div class="mr"><span class="ml">DR No:</span>${receipt.supplierDrNo || "\u2014"}</div>
  <div class="mr"><span class="ml">Supplier:</span>${po.supplier?.name || "\u2014"}</div>
  <div class="mr"><span class="ml">Received at:</span>${po.destination?.name || "\u2014"}${po.destination?.code ? " (" + po.destination.code + ")" : ""}</div>
  <div class="mr"><span class="ml">Date:</span>${dateStr}</div>
  <div class="mr"><span class="ml">Received by:</span>${receipt.receivedByName || "\u2014"}</div>
</div>
<h3 style="font-size:11px;letter-spacing:1px;margin-bottom:4px">ITEMS RECEIVED</h3>
<table><thead><tr>
  <th style="width:30px;text-align:center">#</th><th>Item</th><th>SKU</th>
  <th style="width:55px;text-align:right">Accepted</th>
  <th style="width:55px;text-align:right">Rejected</th>
  <th style="width:65px;text-align:right">Unit Cost</th>
</tr></thead><tbody>${itemRows}</tbody></table>
<div class="tot">
  <div>Total: ${receipt.lines?.length ?? 0} lines, ${totalAccepted} accepted${totalRejected > 0 ? ", " + totalRejected + " rejected" : ""}</div>
  <div class="amt">Receipt Amount: \u20B1${receiptAmount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
</div>
<div class="disc">
  <h3>DISCREPANCIES</h3>
  <div class="cbr"><span class="cb"></span> All items match DR</div>
  <div class="cbr"><span class="cb"></span> Short delivery</div>
  <div class="cbr"><span class="cb"></span> Damaged items</div>
  <div class="cbr"><span class="cb"></span> Wrong items</div>
  <div style="margin-top:8px">Notes:</div><div class="nl"></div><div class="nl"></div>
</div>
<div class="sig"><h3>ACKNOWLEDGMENT</h3>
  <div style="margin-bottom:20px">Checked by: <span class="sl"></span> Date: <span class="dl"></span>
    <div class="slbl">(Warehouse Staff)</div>
  </div>
</div>
<div class="ftr">Printed: ${new Date().toLocaleString("en-PH")} \u2014 CBROS Genuine Autoparts & Accessories, Inc.</div>
</div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><title>Receiving Slips \u2014 ${po.poNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:11px;padding:20px;color:#000;max-width:800px;margin:0 auto}
.slip{padding-bottom:20px}
.page-break{page-break-before:always}
.hdr{text-align:center;border-top:3px double #000;border-bottom:3px double #000;padding:10px 0;margin-bottom:16px}
.hdr h1{font-size:15px;letter-spacing:2px;margin-bottom:2px}
.hdr h2{font-size:10px;font-weight:normal;color:#444}
.meta{margin-bottom:14px;line-height:1.7}
.mr{display:flex}.ml{display:inline-block;width:90px;font-weight:bold;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
th{text-align:left;border-bottom:2px solid #000;padding:3px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.tot{margin:10px 0;padding-top:6px;border-top:2px solid #000;line-height:1.6}
.tot .amt{font-size:13px;font-weight:bold;margin-top:4px}
.disc{margin:16px 0;padding:10px;border:1px solid #999}
.disc h3{font-size:11px;margin-bottom:8px;letter-spacing:1px}
.cb{display:inline-block;width:14px;height:14px;border:1.5px solid #000;margin-right:6px;vertical-align:middle}
.cbr{margin-bottom:4px;font-size:11px}
.nl{border-bottom:1px solid #000;width:100%;height:20px;margin-top:8px}
.sig{margin-top:24px}
.sig h3{font-size:11px;margin-bottom:14px;letter-spacing:1px}
.sl{border-bottom:1px solid #000;width:220px;display:inline-block;margin-right:16px}
.dl{border-bottom:1px solid #000;width:120px;display:inline-block}
.slbl{font-size:9px;color:#666;margin-top:2px;padding-left:40px}
.ftr{border-top:3px double #000;margin-top:20px;padding-top:6px;text-align:center;font-size:9px;color:#666}
@media print{body{padding:0}@page{margin:15mm;size:A4}.page-break{page-break-before:always}}
</style></head><body>${slipPages}</body></html>`;

  w.document.write(html);
  w.document.close();
}

/** Print a professional Purchase Order document */
export function printPurchaseOrder(po: any, opts: { showPricing?: boolean } = {}) {
  const showPricing = opts.showPricing !== false;
  const w = window.open("", "_blank");
  if (!w) return;

  const sortedLines = [...(po.lines || [])].sort((a: any, b: any) => {
    const nameA = a.parentName ? `${a.parentName} (${a.productName})` : a.productName;
    const nameB = b.parentName ? `${b.parentName} (${b.productName})` : b.productName;
    return nameA.localeCompare(nameB);
  });

  // Add displayName BEFORE chunking into pages
  const linesWithName = sortedLines.map((line: any) => ({
    ...line,
    displayName: line.parentName ? `${line.parentName} (${line.productName})` : line.productName,
  }));

  const LINES_PER_PAGE = 45;
  const pages: any[][] = [];
  for (let i = 0; i < linesWithName.length; i += LINES_PER_PAGE) {
    pages.push(linesWithName.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const totalQty = linesWithName.reduce((s: number, l: any) => s + l.orderedQty, 0);
  const grandTotal = linesWithName.reduce((s: number, l: any) => s + l.orderedQty * parseFloat(l.unitCost || "0"), 0);
  const createdDate = po.createdAt ? new Date(po.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "\u2014";
  const submittedDate = po.submittedAt ? new Date(po.submittedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : null;

  const thStyle = "background:#f9fafb;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;padding:5px 6px;border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db";
  const thRow = showPricing
    ? `<th style="width:5%;text-align:center;${thStyle}">#</th><th style="width:50%;text-align:left;${thStyle}">Item</th><th style="width:10%;text-align:center;${thStyle}">Qty</th><th style="width:17%;text-align:right;${thStyle}">Unit Cost</th><th style="width:18%;text-align:right;${thStyle}">Total</th>`
    : `<th style="width:5%;text-align:center;${thStyle}">#</th><th style="width:75%;text-align:left;${thStyle}">Item</th><th style="width:20%;text-align:center;${thStyle}">Qty</th>`;

  function buildRow(line: any, rowNum: number) {
    const cost = parseFloat(line.unitCost || "0");
    const lt = line.orderedQty * cost;
    const bg = rowNum % 2 === 0 ? "#f0f0f0" : "#ffffff";
    const base = `<td style="text-align:center;padding:3px 6px;border-bottom:1px solid #e5e7eb;font-size:9pt">${rowNum}</td><td style="padding:3px 6px;border-bottom:1px solid #e5e7eb;font-size:9pt;font-weight:500">${line.displayName}</td><td style="text-align:center;padding:3px 6px;border-bottom:1px solid #e5e7eb;font-size:9pt">${line.orderedQty}</td>`;
    if (!showPricing) return `<tr style="background:${bg}">${base}</tr>`;
    return `<tr style="background:${bg}">${base}<td style="text-align:right;padding:3px 6px;border-bottom:1px solid #e5e7eb;font-size:9pt">\u20B1${cost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td><td style="text-align:right;padding:3px 6px;border-bottom:1px solid #e5e7eb;font-size:9pt;font-weight:500">\u20B1${lt.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td></tr>`;
  }

  const fullHeader = `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #111">
  <div><h1 style="font-size:14pt;font-weight:700;margin:0 0 2px">CBROS Genuine Autoparts &amp; Accessories</h1><p style="font-size:9pt;color:#374151;margin:0">Naga City, Camarines Sur</p></div>
  <div style="text-align:right"><h2 style="font-size:16pt;font-weight:700;margin:0 0 4px">PURCHASE ORDER</h2><div style="font-size:13pt;font-weight:600;color:#374151">${po.poNo}</div><div style="font-size:9pt;color:#6b7280;margin-top:3px">Date: ${createdDate}</div>${submittedDate ? `<div style="font-size:9pt;color:#6b7280;margin-top:2px">Submitted: ${submittedDate}</div>` : ""}<div style="display:inline-block;font-size:8pt;font-weight:600;text-transform:uppercase;padding:2px 8px;border-radius:3px;margin-top:3px;background:#f3f4f6;color:#374151">${(po.status || "").replace(/_/g, " ")}</div></div>
</div>
<div style="display:flex;gap:40px;margin:12px 0">
  <div style="flex:1"><div style="font-size:8pt;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.5px;margin-bottom:3px">Supplier</div><div style="font-size:10pt;font-weight:600">${po.supplier?.name || "\u2014"}</div>${po.supplier?.contactPhone ? `<div style="font-size:9pt;color:#374151">${po.supplier.contactPhone}</div>` : ""}${po.supplier?.contactEmail ? `<div style="font-size:9pt;color:#374151">${po.supplier.contactEmail}</div>` : ""}</div>
</div>`;

  const pagesHtml = pages.map((pageLines, pi) => {
    const startNum = pi * LINES_PER_PAGE;
    const rows = pageLines.map((line: any, i: number) => buildRow(line, startNum + i + 1)).join("");
    const header = pi === 0 ? fullHeader : `<div style="font-size:9pt;color:#6b7280;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e5e7eb">${po.poNo} \u2014 Page ${pi + 1} of ${pages.length} \u2014 ${po.supplier?.name || ""}</div>`;
    return `<div${pi > 0 ? ' style="page-break-before:always"' : ""}>${header}<table style="width:100%;border-collapse:collapse;margin:10px 0"><thead><tr>${thRow}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");

  const footer = `<div style="font-size:9pt;color:#6b7280;margin-top:5px">${linesWithName.length} item${linesWithName.length !== 1 ? "s" : ""} \u00B7 ${totalQty} total units</div>
${showPricing ? `<div style="display:flex;justify-content:flex-end;margin:10px 0 20px"><table><tr style="font-weight:700;font-size:11pt"><td style="text-align:right;color:#6b7280;padding:4px 8px;border-top:2px solid #111;padding-top:6px">Total:</td><td style="text-align:right;padding:4px 8px;width:150px;border-top:2px solid #111;padding-top:6px">\u20B1${grandTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td></tr></table></div>` : ""}

<div style="display:flex;gap:30px;margin-top:25px;padding-top:15px">
  <div style="flex:1;text-align:center"><div style="border-bottom:1px solid #111;margin-bottom:3px;height:30px"></div><div style="font-size:8pt;color:#6b7280;text-transform:uppercase">Prepared by</div></div>
  <div style="flex:1;text-align:center"><div style="border-bottom:1px solid #111;margin-bottom:3px;height:30px"></div><div style="font-size:8pt;color:#6b7280;text-transform:uppercase">Approved by</div></div>
  <div style="flex:1;text-align:center"><div style="border-bottom:1px solid #111;margin-bottom:3px;height:30px"></div><div style="font-size:8pt;color:#6b7280;text-transform:uppercase">Received by (Supplier)</div></div>
</div>
<div style="margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:8pt;color:#9ca3af;text-align:center">CBROS Genuine Autoparts &amp; Accessories \u00B7 System-generated purchase order from CBROS ERP</div>`;

  const html = `<!DOCTYPE html><html><head><title>Purchase Order \u2014 ${po.poNo}</title>
<style>@page{size:A4 portrait;margin:10mm 12mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;line-height:1.4}</style>
</head><body>${pagesHtml}${footer}</body></html>`;

  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

/* ══════════════════════════════════════════════════════════
 * Purchase Order Detail Page — /procurement/purchase-orders/[poNo]
 *
 * Dense, desktop-first, keyboard-heavy warehouse receiving screen.
 * Zero optimistic UI. All state from backend refetch.
 * ══════════════════════════════════════════════════════════ */
