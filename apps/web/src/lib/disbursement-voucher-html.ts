/**
 * Generates a printable Disbursement Voucher (A4 portrait).
 * Layout: header → PAY TO (with SOA ref) → payment table → reconciliation → signatures.
 */

export interface DVPaymentLine {
  paymentMethod: string;
  amount: number;
  referenceNumber?: string | null;
  bankName?: string | null;
  transactionDate?: string | null;
  platform?: string | null;
}

export interface DVDeductionLine {
  description: string;
  amount: number;
}

export interface DVData {
  dvNumber: string;
  supplierName: string;
  amount: number;
  grossAmount?: number;
  totalDeductions?: number;
  paymentDate: string;
  soaNumber?: string;
  soaDateFrom?: string;
  soaDateTo?: string;
  remarks?: string | null;
  paymentMethod?: string;
  payments?: DVPaymentLine[];
  deductions?: DVDeductionLine[];
  invoices?: any[];
  isVoided?: boolean;
  voidReason?: string | null;
}

function fmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildRef(p: DVPaymentLine): string {
  if (p.paymentMethod === "CASH") return "CASH";
  if (p.paymentMethod === "ONLINE") {
    const platform = p.platform ?? "ONLINE";
    return p.referenceNumber ? `${platform}# ${p.referenceNumber}` : platform;
  }
  // CHECK or BANK_TRANSFER
  const bank = p.bankName ?? "";
  return p.referenceNumber
    ? (bank ? `${bank}# ${p.referenceNumber}` : p.referenceNumber)
    : bank || "—";
}

export function buildDisbursementVoucherHtml(d: DVData): string {
  const gross = d.grossAmount ?? d.amount;
  const totalDed = d.totalDeductions ?? 0;
  const net = gross - totalDed;
  const hasDeductions = totalDed > 0 && d.deductions && d.deductions.length > 0;

  const paymentLines = d.payments && d.payments.length > 0
    ? d.payments
    : d.paymentMethod
      ? [{ paymentMethod: d.paymentMethod, amount: d.amount, referenceNumber: null, bankName: null, transactionDate: null, platform: null }]
      : [];

  // Payment table rows
  const payRows = paymentLines.map((p) => {
    const dt = p.transactionDate ? fmtDate(p.transactionDate) : fmtDate(d.paymentDate);
    return `<tr>
      <td class="pay-cell">${dt}</td>
      <td class="pay-cell">${esc(buildRef(p))}</td>
      <td class="pay-cell" style="text-align:right">${fmt(p.amount)}</td>
    </tr>`;
  }).join("\n");

  // Deduction rows (right-aligned section)
  const dedRows = hasDeductions
    ? (d.deductions ?? []).map((dd) =>
        `<div class="recon-row"><span>${esc(dd.description)} -)</span><span>(${fmt(dd.amount)})</span></div>`
      ).join("\n")
    : "";

  // SOA sub-lines under PAY TO
  const soaLine = d.soaNumber
    ? `<div><b>SOA#:</b> <span style="font-weight:700">${esc(d.soaNumber.replace(/^SUPP-SOA-/, ""))}</span></div>`
    : "";
  const periodLine = d.soaDateFrom && d.soaDateTo
    ? `<div class="payto-sub">${fmtDate(d.soaDateFrom)} \u2013 ${fmtDate(d.soaDateTo)}</div>`
    : "";

  // Reconciliation section (only when deductions exist)
  const reconSection = hasDeductions ? `
<div class="recon">
  <div class="recon-line"></div>
  <div class="recon-row"><span>SOA Amount</span><span>${fmt(gross)}</span></div>
  <div style="height:6px"></div>
  ${dedRows}
  <div class="recon-line"></div>
  <div class="recon-row recon-total"><span>NET PAYMENT</span><span>${fmt(net)}</span></div>
  <div class="recon-dline"></div>
</div>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>DV - ${esc(d.dvNumber)}</title>
<style>
@page { size: letter portrait; margin: 10mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; }
/* Half-page container: letter = 11in, minus 20mm (top+bottom margins) ≈ 10.2in; half = ~5.1in */
.dv-page { min-height: 5in; display: flex; flex-direction: column; }

/* Header */
.company { font-family: 'Rockwell Extra Bold', Rockwell, Georgia, serif; font-weight: 900; font-size: 14pt; text-align: center; letter-spacing: 0.3px; padding-top: 4px; white-space: nowrap; }
.doc-title { text-align: center; font-weight: 700; font-size: 14pt; text-transform: uppercase; margin: 2px 0 20px; }

/* Top info: PAY TO left, DATE/DV# right */
.top-info { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.payto-label { font-size: 12pt; font-weight: 700; margin-bottom: 2px; }
.payto-name { font-size: 16pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; }
.payto-sub { font-size: 10pt; color: #333; margin-top: 1px; }
.payto-sub:first-of-type { font-family: monospace; font-weight: 700; font-size: 10.5pt; color: #000; }
.top-right { text-align: right; font-size: 11pt; line-height: 1.6; white-space: nowrap; }
.top-right b { font-weight: 400; color: #555; }
.top-right span { font-weight: 700; }

/* Payment table */
.pay-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
.pay-table th { text-align: left; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 10px; border-top: 2px solid #000; border-bottom: 2px solid #000; }
.pay-table th.right { text-align: right; }
.pay-cell { padding: 5px 10px; font-size: 9pt; }
.pay-table tbody tr:last-child .pay-cell { border-bottom: 2px solid #000; }

/* Reconciliation (right-aligned) */
.recon { width: 55%; margin-left: auto; margin-top: 16px; font-size: 10.5pt; line-height: 1.7; }
.recon-row { display: flex; justify-content: space-between; padding: 0 2px; }
.recon-line { border-top: 1px solid #000; margin: 2px 0; }
.recon-dline { border-top: 3px double #000; margin: 2px 0; }
.recon-total { font-weight: 900; font-size: 12pt; padding-top: 2px; }

/* Spacer pushes sig+footer to bottom of half page */
.spacer { flex: 1; }

/* Signatures */
.sig { display: flex; justify-content: space-between; font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.sig-col { width: 45%; }
.sig-label { margin-bottom: 4px; }
.sig-line { border-bottom: 1px solid #000; height: 28px; }

/* Footer */
.footer { margin-top: 16px; margin-bottom: 10mm; font-size: 9pt; color: #888; text-align: center; }
/* Voided watermark */
.voided-watermark { position: fixed; top: 35%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 100pt; font-weight: 900; color: rgba(220, 38, 38, 0.12); letter-spacing: 20px; pointer-events: none; z-index: 1; }
</style></head><body>

${d.isVoided ? '<div class="voided-watermark">VOIDED</div>' : ""}
<div class="dv-page">
<div class="company">C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.</div>
<div class="doc-title">Disbursement Voucher</div>

<div class="top-info">
  <div>
    <div class="payto-label">PAY TO:</div>
    <div class="payto-name">${esc(d.supplierName)}</div>
  </div>
  <div class="top-right">
    <div><b>DATE:</b> <span>${fmtDate(d.paymentDate)}</span></div>
    <div><b>DV #:</b> <span style="font-family:monospace">${esc(d.dvNumber)}</span></div>
    ${soaLine}
  </div>
</div>

<table class="pay-table">
  <thead><tr>
    <th style="width:28%">Date</th>
    <th style="width:42%">Reference</th>
    <th class="right" style="width:30%">Amount</th>
  </tr></thead>
  <tbody>
    ${payRows}
  </tbody>
</table>

${reconSection}

<div class="spacer"></div>

<div class="sig">
  <div class="sig-col">
    <div class="sig-label">Checked by</div>
    <div class="sig-line"></div>
  </div>
  <div class="sig-col">
    <div class="sig-label">Received by</div>
    <div class="sig-line"></div>
  </div>
</div>

<div class="footer">This is a computer-generated document.</div>
</div>

</body></html>`;
}
