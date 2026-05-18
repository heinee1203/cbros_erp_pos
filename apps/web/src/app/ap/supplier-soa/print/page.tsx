"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

interface SOAData {
  supplier: { name: string; address?: string; phone?: string };
  transactions: Array<{
    date: string;
    reference: string;
    description: string;
    debit: string;
    credit: string;
    balance: string;
  }>;
  openingBalance: string;
  closingBalance: string;
}

function fmtPeso(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `\u20B1${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PrintSupplierSOA() {
  const { token, locationId, loading: authLoading } = useAuth();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const supplierId = searchParams.get("supplierId");
  const [data, setData] = useState<SOAData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && token && locationId && supplierId) {
      apiFetch<SOAData>(`/ap/reports/soa/${supplierId}`, { token, locationId })
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [authLoading, token, locationId, supplierId]);

  useEffect(() => {
    if (data && !loading) {
      setTimeout(() => window.print(), 500);
    }
  }, [data, loading]);

  if (loading || !data) {
    return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Loading statement...</div>;
  }

  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const closingBal = parseFloat(data.closingBalance);

  // Simple aging from transactions
  const txns = data.transactions ?? [];
  const debits = txns.filter((t) => parseFloat(t.debit) > 0);
  let current = 0, d31 = 0, d61 = 0, over90 = 0;
  for (const t of debits) {
    const age = Math.floor((Date.now() - new Date(t.date).getTime()) / 86400000);
    const amt = parseFloat(t.debit);
    if (age <= 30) current += amt;
    else if (age <= 60) d31 += amt;
    else if (age <= 90) d61 += amt;
    else over90 += amt;
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "30px 40px", fontFamily: "Arial, sans-serif", fontSize: 12 }}>
      {/* Company header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>CBROS GENUINE AUTOPARTS</h2>
        <p style={{ margin: 0, fontSize: 13 }}>& ACCESSORIES, INC.</p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#666" }}>Naga City, Camarines Sur</p>
        <h3 style={{ margin: "16px 0 0", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>Supplier Statement of Account</h3>
      </div>

      {/* Supplier + date */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>{data.supplier.name}</p>
          {data.supplier.address && <p style={{ margin: "2px 0 0", color: "#666" }}>{data.supplier.address}</p>}
          {data.supplier.phone && <p style={{ margin: "2px 0 0", color: "#666" }}>{data.supplier.phone}</p>}
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0 }}>Date: <strong>{today}</strong></p>
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #333", margin: "8px 0" }} />

      {/* Transaction table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #333" }}>
            <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 700 }}>Date</th>
            <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 700 }}>Reference</th>
            <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 700 }}>Description</th>
            <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 700 }}>Debit</th>
            <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 700 }}>Credit</th>
            <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 700 }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {txns.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#999" }}>No transactions found.</td></tr>
          ) : txns.map((t, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "4px" }}>{new Date(t.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</td>
              <td style={{ padding: "4px" }}>{t.reference}</td>
              <td style={{ padding: "4px" }}>{t.description}</td>
              <td style={{ padding: "4px", textAlign: "right", fontFamily: "monospace" }}>{parseFloat(t.debit) > 0 ? fmtPeso(t.debit) : ""}</td>
              <td style={{ padding: "4px", textAlign: "right", fontFamily: "monospace" }}>{parseFloat(t.credit) > 0 ? fmtPeso(t.credit) : ""}</td>
              <td style={{ padding: "4px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtPeso(t.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr style={{ border: "none", borderTop: "2px solid #333", margin: "8px 0" }} />

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <div style={{ width: 280 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
            <span>Opening Balance:</span>
            <span style={{ fontFamily: "monospace" }}>{fmtPeso(data.openingBalance)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "2px solid #333", fontSize: 14, fontWeight: 700 }}>
            <span>TOTAL OUTSTANDING:</span>
            <span style={{ fontFamily: "monospace" }}>{fmtPeso(closingBal)}</span>
          </div>
        </div>
      </div>

      {/* Aging summary */}
      <div style={{ marginTop: 20, padding: 12, border: "1px solid #ddd", borderRadius: 4, fontSize: 11 }}>
        <strong>Aging Summary:</strong>
        <div style={{ display: "flex", gap: 20, marginTop: 6 }}>
          <span>Current (0-30): {fmtPeso(current)}</span>
          <span>31-60 days: {fmtPeso(d31)}</span>
          <span>61-90 days: {fmtPeso(d61)}</span>
          <span>Over 90 days: {fmtPeso(over90)}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between" }}>
        <div style={{ borderTop: "1px solid #333", paddingTop: 4, width: 200, textAlign: "center", fontSize: 10 }}>Prepared by</div>
        <div style={{ borderTop: "1px solid #333", paddingTop: 4, width: 200, textAlign: "center", fontSize: 10 }}>Approved by</div>
      </div>

      <p style={{ marginTop: 24, fontSize: 10, color: "#999", textAlign: "center" }}>
        Please remit payment at your earliest convenience. For questions, contact us at (054) XXX-XXXX.
      </p>
    </div>
  );
}
