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

export interface DVAdditionalChargeLine {
  chargeType: string;
  description: string;
  referenceNumber?: string | null;
  amount: number;
}

export interface DVSoaRef {
  soaNumber: string;
  allocatedAmount: number;
  dateFrom?: string | null;
  dateTo?: string | null;
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
  /** Multi-SOA references from junction table */
  soaRefs?: DVSoaRef[];
  remarks?: string | null;
  paymentMethod?: string;
  payments?: DVPaymentLine[];
  deductions?: DVDeductionLine[];
  additionalCharges?: DVAdditionalChargeLine[];
  invoices?: any[];
  /** Credit memos from the SOA (negative line items) — shown in print breakdown */
  soaCreditMemos?: Array<{ invoiceNumber: string; amount: number }>;
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
  const totalCMs = (d.soaCreditMemos ?? []).reduce((s, cm) => s + cm.amount, 0);
  const totalDed = d.totalDeductions ?? 0;
  const totalCharges = (d.additionalCharges ?? []).reduce((s, c) => s + c.amount, 0);
  const net = gross + totalCharges - totalCMs - totalDed;
  const hasDeductions = totalDed > 0 && d.deductions && d.deductions.length > 0;
  const hasCharges = (d.additionalCharges ?? []).length > 0;

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

  // Build all deduction lines: SOA credit memos + DV deductions (EWT, etc.)
  const soaCMs = (d.soaCreditMemos ?? []).map((cm) =>
    `<div class="recon-row"><span>${esc(cm.invoiceNumber)} -)</span><span>(${fmt(cm.amount)})</span></div>`
  ).join("\n");
  const otherDeds = (d.deductions ?? []).map((dd) =>
    `<div class="recon-row"><span>${esc(dd.description)} -)</span><span>(${fmt(dd.amount)})</span></div>`
  ).join("\n");

  const hasCMs = (d.soaCreditMemos ?? []).length > 0;
  const hasAnyBreakdown = hasDeductions || hasCMs || hasCharges;

  // Additional charges rendered BEFORE deductions/CMs (natural top-down math
  // reading order: gross → + charges → − deductions → net)
  const chargeLines = (d.additionalCharges ?? []).map((c) =>
    `<div class="recon-row"><span>+ ${esc(c.description)}${c.referenceNumber ? ` (${esc(c.referenceNumber)})` : ""}</span><span>${fmt(c.amount)}</span></div>`
  ).join("\n");
  const chargeSubtotal = (d.additionalCharges ?? []).length > 1
    ? `<div class="recon-row"><span>&nbsp;&nbsp;Subtotal</span><span>${fmt(totalCharges)}</span></div>`
    : "";

  // SOA refs for the breakdown table (header SOA# line removed — table is authoritative)
  const soaRefs = d.soaRefs && d.soaRefs.length > 0 ? d.soaRefs : d.soaNumber ? [{ soaNumber: d.soaNumber, allocatedAmount: gross, dateFrom: d.soaDateFrom, dateTo: d.soaDateTo }] : [];

  // SOA breakdown table — always rendered when we have at least one SOA
  const soaBreakdownSection = soaRefs.length >= 1 ? `
<div style="margin-bottom:12px">
  <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;border-bottom:1px solid #000;padding-bottom:2px">SOA Details</div>
  <table style="width:100%;border-collapse:collapse;font-size:9pt">
    <thead><tr>
      <th style="text-align:left;padding:3px 0;font-weight:700">SOA #</th>
      <th style="text-align:left;padding:3px 0;font-weight:700">Period</th>
      <th style="text-align:right;padding:3px 0;font-weight:700">Amount</th>
    </tr></thead>
    <tbody>
      ${soaRefs.map((r) => `<tr>
        <td style="padding:2px 0;font-family:monospace;font-weight:600">${esc(r.soaNumber.replace(/^SUPP-SOA-/, ""))}</td>
        <td style="padding:2px 0;color:#333">${r.dateFrom && r.dateTo ? `${fmtDate(r.dateFrom)} – ${fmtDate(r.dateTo)}` : "—"}</td>
        <td style="padding:2px 0;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.allocatedAmount)}</td>
      </tr>`).join("\n")}
      <tr style="border-top:1px solid #000;font-weight:900">
        <td style="padding:3px 0" colspan="2">TOTAL</td>
        <td style="padding:3px 0;text-align:right;font-variant-numeric:tabular-nums">${fmt(soaRefs.reduce((s, r) => s + r.allocatedAmount, 0))}</td>
      </tr>
    </tbody>
  </table>
</div>` : "";

  // Reconciliation section (when there are CMs, deductions, or charges)
  const reconSection = hasAnyBreakdown ? `
<div class="recon">
  <div class="recon-line"></div>
  <div class="recon-row"><span>Gross Amount</span><span>${fmt(gross)}</span></div>
  ${chargeLines}
  ${chargeSubtotal}
  ${soaCMs}
  ${otherDeds}
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
.payto-name { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; }
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
.recon { width: 45%; margin-left: auto; margin-top: 10px; font-size: 9pt; line-height: 1.4; }
.recon-row { display: flex; justify-content: space-between; padding: 0 2px; }
.recon-line { border-top: 1px solid #000; margin: 1px 0; }
.recon-dline { border-top: 3px double #000; margin: 1px 0; }
.recon-total { font-weight: 900; font-size: 10pt; padding-top: 1px; }

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
  </div>
</div>

${soaBreakdownSection}

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
