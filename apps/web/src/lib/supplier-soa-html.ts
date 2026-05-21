/**
 * Generates a printable supplier statement of account.
 */

export type SupplierSOAPrintMode = "detailed" | "concise";

export interface SupplierSOAData {
  supplierName: string;
  supplierAddress?: string | null;
  supplierTin?: string | null;
  supplierContact?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  generatedAt?: string | null;
  generatedByName?: string | null;
  invoices: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    balance: number;
  }>;
  /**
   * Optional persistent SOA number (e.g. "SUPP-SOA-2026-0001") rendered in
   * the info block when present. Omitted for ephemeral preview prints.
   */
  soaNumber?: string;
  printMode?: SupplierSOAPrintMode;
}

function fmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escMaybe(s: string | null | undefined): string {
  return s?.trim() ? esc(s.trim()) : "";
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function daysPastDue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

function isCreditMemoLine(inv: SupplierSOAData["invoices"][number]): boolean {
  const invoiceNumber = inv.invoiceNumber?.trim().toUpperCase() ?? "";
  return inv.totalAmount < 0 || inv.balance < 0 || invoiceNumber.startsWith("CM");
}

function agingSummary(lines: SupplierSOAData["invoices"]) {
  const buckets = {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
  };

  for (const inv of lines) {
    if (isCreditMemoLine(inv)) continue;
    const balance = inv.balance;
    const days = daysPastDue(inv.dueDate);
    if (days <= 0) buckets.current += balance;
    else if (days <= 30) buckets.days1To30 += balance;
    else if (days <= 60) buckets.days31To60 += balance;
    else if (days <= 90) buckets.days61To90 += balance;
    else buckets.days90Plus += balance;
  }

  return buckets;
}

function moneyCell(value: number, options?: { strong?: boolean; danger?: boolean; credit?: boolean }): string {
  const classes = [
    "money",
    options?.strong ? "strong" : "",
    options?.danger ? "danger" : "",
    options?.credit ? "credit" : "",
  ].filter(Boolean).join(" ");
  const rendered = options?.credit ? `(${fmt(Math.abs(value))})` : fmt(value);
  return `<span class="${classes}">${rendered}</span>`;
}

function invoiceRow(inv: SupplierSOAData["invoices"][number], mode: SupplierSOAPrintMode): string {
  if (mode === "concise") {
    return `<tr>
<td>${fmtDate(inv.invoiceDate)}</td>
<td>${fmtDate(inv.dueDate)}</td>
<td class="mono strong">${esc(inv.invoiceNumber)}</td>
<td class="right">${moneyCell(inv.totalAmount)}</td>
</tr>`;
  }

  return `<tr>
<td>${fmtDate(inv.invoiceDate)}</td>
<td>${fmtDate(inv.dueDate)}</td>
<td class="mono strong">${esc(inv.invoiceNumber)}</td>
<td class="right">${moneyCell(inv.totalAmount)}</td>
<td class="right">${moneyCell(inv.paidAmount)}</td>
</tr>`;
}

function creditRow(inv: SupplierSOAData["invoices"][number]): string {
  return `<tr class="credit-row">
<td>${fmtDate(inv.invoiceDate)}</td>
<td class="mono strong">${esc(inv.invoiceNumber)}</td>
<td class="right">${moneyCell(inv.balance || inv.totalAmount, { strong: true, credit: true })}</td>
</tr>`;
}

export function buildSupplierSOAHtml(d: SupplierSOAData): string {
  const printMode = d.printMode ?? "detailed";
  const isConcise = printMode === "concise";
  const sorted = [...(d.invoices || [])].sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
  const payableLines = sorted.filter((i) => !isCreditMemoLine(i));
  const creditLines = sorted.filter(isCreditMemoLine);
  const aging = agingSummary(sorted);

  const totalInvoiced = payableLines.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = payableLines.reduce((s, i) => s + i.paidAmount, 0);
  const grossPayableBalance = payableLines.reduce((s, i) => s + i.balance, 0);
  const creditMemoTotal = creditLines.reduce((s, i) => s + Math.abs(i.balance || i.totalAmount), 0);
  const netBalance = grossPayableBalance - creditMemoTotal;
  const overdueBalance = payableLines.reduce((s, i) => s + (daysPastDue(i.dueDate) > 0 ? i.balance : 0), 0);

  const dateRange = sorted.length > 0
    ? `${fmtDate(sorted[0].invoiceDate)} - ${fmtDate(sorted[sorted.length - 1].invoiceDate)}`
    : "";

  const generatedAt = d.generatedAt ? new Date(d.generatedAt) : new Date();
  const supplierDetails = [
    escMaybe(d.supplierAddress),
    d.supplierTin ? `TIN: ${escMaybe(d.supplierTin)}` : "",
    d.supplierContact ? `Contact: ${escMaybe(d.supplierContact)}` : "",
    d.supplierPhone ? `Phone: ${escMaybe(d.supplierPhone)}` : "",
    d.supplierEmail ? `Email: ${escMaybe(d.supplierEmail)}` : "",
  ].filter(Boolean);

  const rows = payableLines.map((inv) => invoiceRow(inv, printMode)).join("\n");
  const creditRows = creditLines.map(creditRow).join("\n");
  const summaryBlock = isConcise ? "" : `
  <div class="summary">
    <div class="metric"><div class="metric-label">Total Invoiced</div><div class="metric-value">${fmt(totalInvoiced)}</div></div>
    <div class="metric"><div class="metric-label">Paid / Applied</div><div class="metric-value">${fmt(totalPaid)}</div></div>
    <div class="metric"><div class="metric-label">Credit Memos</div><div class="metric-value credit">${creditMemoTotal > 0 ? `(${fmt(creditMemoTotal)})` : fmt(0)}</div></div>
    <div class="metric"><div class="metric-label">Overdue</div><div class="metric-value danger">${fmt(overdueBalance)}</div></div>
    <div class="metric"><div class="metric-label">Net Payable</div><div class="metric-value">${fmt(netBalance)}</div></div>
  </div>

  <div class="aging">
    <div class="metric"><div class="metric-label">Current</div><div class="metric-value">${fmt(aging.current)}</div></div>
    <div class="metric"><div class="metric-label">1-30 Days</div><div class="metric-value">${fmt(aging.days1To30)}</div></div>
    <div class="metric"><div class="metric-label">31-60 Days</div><div class="metric-value">${fmt(aging.days31To60)}</div></div>
    <div class="metric"><div class="metric-label">61-90 Days</div><div class="metric-value">${fmt(aging.days61To90)}</div></div>
    <div class="metric"><div class="metric-label">90+ Days</div><div class="metric-value danger">${fmt(aging.days90Plus)}</div></div>
  </div>`;
  const conciseNetPayable = isConcise ? `
  <div class="concise-total-strip">
    <span>Net Payable</span>
    <strong>${fmt(netBalance)}</strong>
  </div>` : "";
  const notesBlock = isConcise ? "" : `
  <div class="notes">
    Verify invoice selection, due dates, and credit memos before issuing a disbursement voucher. Supplier invoices should be settled in full, with deductions or credit memos shown separately from the invoice list.
  </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Supplier SOA - ${esc(d.supplierName)}</title>
<style>
@page {
  size: letter portrait;
  margin: 12mm;
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-size: 7.5pt;
    color: #6b7280;
  }
}
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.2pt; color: #111827; margin: 0; padding: 0; }
.page { min-height: 252mm; display: flex; flex-direction: column; }
.brand { text-align: center; margin-bottom: 12px; }
.company { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 15pt; letter-spacing: 0.5px; }
.title { margin-top: 2px; font-size: 12pt; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.meta-grid { display: grid; grid-template-columns: 1fr 252px; gap: 12px; margin-bottom: 10px; }
.box { border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 11px; }
.supplier-name { font-size: 12pt; font-weight: 800; margin-bottom: 4px; }
.supplier-details { color: #4b5563; font-size: 8.1pt; line-height: 1.35; }
.kv { display: grid; grid-template-columns: 82px 1fr; gap: 4px 10px; line-height: 1.42; }
.kv b { color: #4b5563; font-weight: 700; }
.mono { font-family: 'Courier New', monospace; }
.summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin-bottom: 9px; }
.metric { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 9px; }
.metric-label { color: #6b7280; font-size: 7.2pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
.metric-value { margin-top: 3px; font-size: 10.4pt; font-weight: 800; font-variant-numeric: tabular-nums; }
.aging { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin-bottom: 10px; }
.aging .metric { background: #f9fafb; }
.danger { color: #b91c1c; }
.credit { color: #047857; }
.muted { color: #6b7280; }
.strong { font-weight: 800; }
table { width: 100%; border-collapse: collapse; font-size: 8.4pt; }
thead { display: table-header-group; }
th { background: #f3f4f6; text-align: left; padding: 5px 6px; font-size: 7.3pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-top: 2px solid #111827; border-bottom: 2px solid #111827; }
td { padding: 4.5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafafa; }
tbody tr.credit-row td { background: #f0fdf4; }
.section-title { margin: 11px 0 5px; font-size: 8pt; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #374151; }
.right { text-align: right; }
.money { font-variant-numeric: tabular-nums; }
.total-row td { border-top: 2px solid #111827; border-bottom: 3px double #111827; background: #fff; font-weight: 800; font-size: 9pt; padding-top: 7px; }
.notes { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 9px; color: #4b5563; font-size: 7.8pt; line-height: 1.4; }
.spacer { flex: 1; }
.sig-section { margin-top: 22px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; font-size: 8.8pt; }
.sig-label { margin-bottom: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.sig-line { border-bottom: 1px solid #111827; height: 1px; }
.footer { margin-top: 14px; font-size: 7.5pt; color: #6b7280; text-align: center; }
.page.concise .brand { margin-bottom: 10px; }
.page.concise .meta-grid { grid-template-columns: 1fr 230px; margin-bottom: 12px; }
.page.concise .box { padding: 8px 10px; }
.page.concise .section-title { margin-top: 12px; }
.concise-total-strip { margin-top: 8px; border-top: 2px solid #111827; border-bottom: 3px double #111827; padding: 6px 10px; display: flex; justify-content: flex-end; gap: 28px; font-weight: 800; font-size: 9.5pt; text-transform: uppercase; }
</style></head><body>

<div class="page ${isConcise ? "concise" : "detailed"}">
  <div class="brand">
    <div class="company">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
    <div class="title">Supplier Statement of Account</div>
  </div>

  <div class="meta-grid">
    <div class="box">
      <div class="supplier-name">${esc(d.supplierName)}</div>
      ${supplierDetails.length > 0 ? `<div class="supplier-details">${supplierDetails.join("<br>")}</div>` : `<div class="supplier-details muted">No supplier address/TIN/contact on file.</div>`}
    </div>
    <div class="box">
      <div class="kv">
        ${d.soaNumber ? `<b>SOA #</b><span class="mono strong">${esc(d.soaNumber.replace(/^SUPP-SOA-/, ""))}</span>` : `<b>SOA #</b><span class="muted">Preview only</span>`}
        <b>Period</b><span>${dateRange || "No invoices"}</span>
        <b>Invoices</b><span>${payableLines.length.toLocaleString("en-PH")}</span>
        <b>Credits</b><span>${creditLines.length.toLocaleString("en-PH")}</span>
        ${isConcise ? `<b>Net Payable</b><span class="strong">${fmt(netBalance)}</span>` : ""}
        <b>Generated</b><span>${fmtDateTime(generatedAt)}</span>
        <b>By</b><span>${escMaybe(d.generatedByName) || "System"}</span>
      </div>
    </div>
  </div>

  ${summaryBlock}

  <div class="section-title">Payable Invoices</div>
  <table>
    <thead>
      <tr>
        ${isConcise ? `
        <th style="width:16%">Invoice Date</th>
        <th style="width:16%">Due Date</th>
        <th style="width:42%">Invoice #</th>
        <th class="right" style="width:26%">Amount</th>
        ` : `
        <th style="width:12%">Invoice Date</th>
        <th style="width:12%">Due Date</th>
        <th style="width:32%">Invoice #</th>
        <th class="right" style="width:22%">Invoice Amount</th>
        <th class="right" style="width:22%">Paid / Applied</th>
        `}
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${isConcise ? 4 : 5}" class="muted" style="text-align:center;padding:18px">No payable invoices selected.</td></tr>`}
      <tr class="total-row">
        <td colspan="${isConcise ? 3 : 4}" class="right">TOTAL PAYABLE INVOICES</td>
        <td class="right">${fmt(grossPayableBalance)}</td>
      </tr>
    </tbody>
  </table>

  ${creditLines.length > 0 ? `
  <div class="section-title">Available / Applied Credit Memos</div>
  <table>
    <thead>
      <tr>
        <th style="width:18%">Credit Date</th>
        <th>Credit Memo #</th>
        <th class="right" style="width:22%">Credit Amount</th>
      </tr>
    </thead>
    <tbody>
      ${creditRows}
      <tr class="total-row">
        <td colspan="2" class="right">TOTAL CREDITS</td>
        <td class="right credit">(${fmt(creditMemoTotal)})</td>
      </tr>
    </tbody>
  </table>
  ` : ""}

  ${conciseNetPayable}
  ${notesBlock}

  <div class="spacer"></div>

  <div class="sig-section">
    <div>
      <div class="sig-label">Prepared by</div>
      <div class="sig-line"></div>
    </div>
    <div>
      <div class="sig-label">Approved by</div>
      <div class="sig-line"></div>
    </div>
    <div>
      <div class="sig-label">Received by</div>
      <div class="sig-line"></div>
    </div>
  </div>

  <div class="footer">This is a computer-generated document. Printed copies should be matched to the generated SOA record before payment release.</div>
</div>

</body></html>`;
}
