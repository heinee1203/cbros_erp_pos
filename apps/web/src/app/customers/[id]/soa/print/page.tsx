"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

/* ── Types ── */
interface Customer {
  name: string;
  customerType: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  paymentTermsDays: number;
  currentBalance: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  referenceNumber: string | null;
  notes: string | null;
  recordedAt: string;
}

interface SOAData {
  customer: Customer;
  openingBalance: number;
  transactions: Transaction[];
  closingBalance: number;
}

/* ── Formatters ── */
function fmtAmt(v: number): string {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateLong(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtPeriod(from: string, to: string): { period: string; year: string } {
  const f = new Date(from);
  const t = new Date(to);
  const fOpts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
  const tOpts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };

  if (f.getFullYear() !== t.getFullYear()) {
    return {
      period: `${f.toLocaleDateString("en-US", { ...fOpts, year: "numeric" })} - ${t.toLocaleDateString("en-US", { ...tOpts, year: "numeric" })}`,
      year: `${f.getFullYear()}-${t.getFullYear()}`,
    };
  }
  return {
    period: `${f.toLocaleDateString("en-US", fOpts)} - ${t.toLocaleDateString("en-US", tOpts)}`,
    year: String(t.getFullYear()),
  };
}

function termsLabel(days: number): string {
  return days === 0 ? "COD" : `Net ${days}`;
}

const BLANK = "\u00A0\u00A0\u00A0______________________________";

/* ═══════════════════════════════════════════════════════ */

export default function SOAPrintPage() {
  const { id } = useParams() as { id: string };
  const searchParams = useSearchParams();
  // Preferred: historical snapshot by soaId (reads stored soa_line_items).
  // Fallback: date range re-query for ad-hoc statements that aren't persisted.
  const soaId = searchParams.get("soaId");
  const from = searchParams.get("from") || "2025-01-01";
  const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);

  const { token, locationId, loading: authLoading } = useAuth();
  const [data, setData] = useState<SOAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && token && locationId && id) {
      const url = soaId
        ? `/customers/reports/soa-by-id/${soaId}`
        : `/customers/reports/soa/${id}?from=${from}&to=${to}`;
      apiFetch<SOAData>(url, { token, locationId })
        .then((res) => setData(res))
        .catch((err) => setError(err?.message || "Failed to load"))
        .finally(() => setLoading(false));
    }
  }, [authLoading, token, locationId, id, soaId, from, to]);

  useEffect(() => {
    if (data && !loading) {
      setTimeout(() => window.print(), 800);
    }
  }, [data, loading]);

  if (loading || !data) {
    return (
      <div style={{ padding: 40, fontFamily: "Arial, sans-serif", textAlign: "center" }}>
        {error ? `Error: ${error}` : "Loading statement..."}
      </div>
    );
  }

  const c = data.customer;
  const { period, year } = fmtPeriod(from, to);

  const charges = data.transactions.filter((t) => t.type === "CHARGE" || (t.type === "ADJUSTMENT" && parseFloat(t.amount) > 0));
  const credits = data.transactions.filter((t) => t.type === "PAYMENT" || t.type === "CREDIT_NOTE" || (t.type === "ADJUSTMENT" && parseFloat(t.amount) < 0));

  const chargeTotal = charges.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const creditTotal = credits.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const totalPayable = chargeTotal - creditTotal;

  const MIN_BILLING_ROWS = 22;
  const emptyChargeRows = Math.max(0, MIN_BILLING_ROWS - charges.length);
  const MIN_CREDIT_ROWS = 4;
  const emptyCreditRows = Math.max(0, MIN_CREDIT_ROWS - credits.length);

  // Inline styles — most reliable for print
  const border = "1px solid #000";
  const cellBase: React.CSSProperties = { border, padding: "3px 8px", fontSize: "10pt", height: 20, verticalAlign: "middle" };
  const cellR: React.CSSProperties = { ...cellBase, textAlign: "right", fontFamily: "'Courier New', monospace" };
  const headerCell: React.CSSProperties = { ...cellBase, fontWeight: 700, background: "#e8e8e8", textAlign: "center", fontSize: "9pt" };
  const emptyCell: React.CSSProperties = { border, padding: "2px 8px", height: 18 };
  const totalCell: React.CSSProperties = { border, padding: "5px 8px", fontWeight: 700, fontSize: "11pt", background: "#e8e8e8" };
  const totalCellR: React.CSSProperties = { ...totalCell, textAlign: "right", fontFamily: "'Courier New', monospace" };
  const tbl: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: "10pt" };

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm 12mm; }
        @media print {
          nav, header, aside, .sidebar, [data-sidebar], .app-header, .app-nav { display: none !important; }
          main, .main-content, [data-main] { margin: 0 !important; padding: 0 !important; width: 100% !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body { margin: 0; padding: 0; }
      `}</style>

      <div style={{ fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000", background: "#fff", maxWidth: 760, margin: "0 auto", padding: "8mm 0" }}>

        {/* ── Company Header (Cooper Black style) ── */}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Rockwell Extra Bold', 'Rockwell', 'Georgia', serif", fontWeight: 900, fontSize: "17pt", letterSpacing: "0.5px" }}>
            C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.
          </div>
        </div>

        {/* ── Customer Info Block ── */}
        <table style={{ ...tbl, marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={{ border, padding: "5px 10px", width: "58%", verticalAlign: "top", lineHeight: 1.8 }}>
                <div><strong>CUSTOMER:</strong> {c.name}</div>
                <div><strong>CONTACT PERSON:</strong> {c.contactPerson || "______________________________"}</div>
                <div><strong>ADDRESS:</strong> {c.address || "______________________________"}</div>
                <div><strong>SALESMAN:</strong> ______________________________</div>
              </td>
              <td style={{ border, padding: "5px 10px", width: "42%", verticalAlign: "top", lineHeight: 1.8 }}>
                <div><strong>TEL NOS:</strong> {c.phone?.startsWith("AR-") ? "______________________________" : c.phone}</div>
                <div><strong>CEL NOS:</strong> {c.phone?.startsWith("AR-") ? "______________________________" : c.phone}</div>
                <div><strong>EMAIL ADD:</strong> {c.email || "______________________________"}</div>
                <div><strong>TERMS:</strong> {termsLabel(c.paymentTermsDays)}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── BILLING STATEMENT ── */}
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: "13pt", margin: "12px 0 6px" }}>BILLING STATEMENT</div>

        <table style={tbl}>
          <thead>
            <tr>
              <th style={{ ...headerCell, textAlign: "left" }} colSpan={2}>MONTH/PERIOD: {period}</th>
              <th style={{ ...headerCell, textAlign: "right" }}>YEAR: {year}</th>
            </tr>
            <tr>
              <th style={{ ...headerCell, width: "28%" }}>DATE</th>
              <th style={{ ...headerCell, width: "37%" }}>PARTICULARS</th>
              <th style={{ ...headerCell, width: "35%" }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((t) => (
              <tr key={t.id}>
                <td style={cellBase}>{fmtDateLong(t.recordedAt)}</td>
                <td style={cellBase}>{t.referenceNumber || "Credit Sale"}</td>
                <td style={cellR}>{fmtAmt(Math.abs(parseFloat(t.amount)))}</td>
              </tr>
            ))}
            {Array.from({ length: emptyChargeRows }).map((_, i) => (
              <tr key={`e${i}`}>
                <td style={emptyCell}>&nbsp;</td>
                <td style={emptyCell}>&nbsp;</td>
                <td style={emptyCell}>&nbsp;</td>
              </tr>
            ))}
            <tr>
              <td style={totalCell} colSpan={2}>TOTAL</td>
              <td style={totalCellR}>{"\u20B1"}{fmtAmt(chargeTotal)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── CREDIT MEMO ── */}
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: "13pt", margin: "14px 0 6px" }}>CREDIT MEMO</div>

        <table style={tbl}>
          <thead>
            <tr>
              <th style={{ ...headerCell, width: "18%" }}>DATE</th>
              <th style={{ ...headerCell, width: "28%" }}>REFERENCE INVOICE</th>
              <th style={{ ...headerCell, width: "22%" }}>AMOUNT</th>
              <th style={{ ...headerCell, width: "16%" }}>CHECKED BY</th>
              <th style={{ ...headerCell, width: "16%" }}>APPROVED BY</th>
            </tr>
          </thead>
          <tbody>
            {credits.map((t) => (
              <tr key={t.id}>
                <td style={cellBase}>{fmtDateLong(t.recordedAt)}</td>
                <td style={cellBase}>{t.referenceNumber || t.type}</td>
                <td style={cellR}>{fmtAmt(Math.abs(parseFloat(t.amount)))}</td>
                <td style={emptyCell}>&nbsp;</td>
                <td style={emptyCell}>&nbsp;</td>
              </tr>
            ))}
            {Array.from({ length: emptyCreditRows }).map((_, i) => (
              <tr key={`ce${i}`}>
                <td style={emptyCell}>&nbsp;</td>
                <td style={emptyCell}>&nbsp;</td>
                <td style={emptyCell}>&nbsp;</td>
                <td style={emptyCell}>&nbsp;</td>
                <td style={emptyCell}>&nbsp;</td>
              </tr>
            ))}
            <tr>
              <td style={totalCell} colSpan={2}>TOTAL</td>
              <td style={totalCellR}>{creditTotal > 0 ? fmtAmt(creditTotal) : "\u2013"}</td>
              <td style={{ ...totalCell, textAlign: "center" }}>&nbsp;</td>
              <td style={{ ...totalCell, textAlign: "center" }}>&nbsp;</td>
            </tr>
          </tbody>
        </table>

        {/* ── TOTAL PAYABLE ── */}
        <table style={{ ...tbl, marginTop: 10 }}>
          <tbody>
            <tr>
              <td style={{ ...totalCell, width: "65%", fontSize: "12pt" }}>TOTAL PAYABLE</td>
              <td style={{ ...totalCellR, width: "35%", fontSize: "12pt" }}>{"\u20B1"}{fmtAmt(totalPayable)}</td>
            </tr>
          </tbody>
        </table>

        {/* ── Payment Notice ── */}
        <div style={{ textAlign: "center", fontSize: "8.5pt", fontWeight: 700, margin: "14px 0 10px", lineHeight: 1.6 }}>
          PLEASE MAKE CHECK PAYABLE TO C-BROS GENUINE AUTOPARTS &amp; ACCESSORIES, INC.<br />
          PAYMENTS WILL BE COLLECTED WITHIN 5 DAYS AFTER RECEIPT OF SOA.
        </div>

        {/* ── Receipt Acknowledgment ── */}
        <table style={{ ...tbl, fontSize: "9pt" }}>
          <tbody>
            <tr>
              <td style={{ border, padding: "8px 10px", width: "50%", verticalAlign: "top", lineHeight: 2.2 }}>
                <strong>RECEIVED THE ABOVE STATEMENT OF ACCOUNT:</strong><br />
                PRINTED NAME: {BLANK}<br />
                SIGNATURE: {BLANK}<br />
                DATE RECEIVED: {BLANK}
              </td>
              <td style={{ border, padding: "8px 10px", width: "25%", verticalAlign: "top", lineHeight: 2.2 }}>
                <strong>PAYMENT DETAILS</strong><br />
                CASH: __________________<br />
                CHECK: _________________<br />
                DATE: __________________
              </td>
              <td style={{ border, padding: "8px 10px", width: "25%", verticalAlign: "top", lineHeight: 2.2 }}>
                <strong>RCVD BY:</strong><br /><br /><br /><br />
                ________________________
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
