"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useRecurringExpenses, useCreateExpense, useUpdateExpense, type RecurringExpense } from "@/hooks/use-cashflow";

const CATEGORIES = [
  { value: "RENT", label: "Rent" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "PAYROLL", label: "Payroll" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "LOAN_PAYMENT", label: "Loan Payment" },
  { value: "OTHER", label: "Other" },
];

function fmtPeso(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

export default function RecurringExpensesPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const { data, isLoading } = useRecurringExpenses(token, locationId);
  const createMut = useCreateExpense(token, locationId);
  const updateMut = useUpdateExpense(token, locationId);
  const expenses = data?.data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);

  // Form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("1");
  const [notes, setNotes] = useState("");

  const openCreate = () => {
    setEditing(null);
    setName(""); setCategory("OTHER"); setAmount(""); setDueDay("1"); setNotes("");
    setShowModal(true);
  };

  const openEdit = (e: RecurringExpense) => {
    setEditing(e);
    setName(e.name); setCategory(e.category); setAmount(e.amount); setDueDay(String(e.dueDay)); setNotes(e.notes ?? "");
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = { name, category, amount, dueDay: parseInt(dueDay) || 1, notes: notes || null };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    setShowModal(false);
  };

  const totalMonthly = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);

  const fieldClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recurring Expenses</h2>
          <p className="text-sm text-muted-foreground">
            Monthly total: <span className="font-semibold text-foreground">{fmtPeso(totalMonthly)}</span>
          </p>
        </div>
        <button onClick={openCreate} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1 inline h-4 w-4" /> Add Expense
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Due Day</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">No recurring expenses. Click "Add Expense" to start tracking.</td></tr>
            ) : expenses.map((e, i) => (
              <tr key={e.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                <td className="px-3 py-2 font-medium">{e.name}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{e.category.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtPeso(e.amount)}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{e.dueDay}{getOrdinal(e.dueDay)}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => openEdit(e)} className="text-xs font-medium text-primary hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold">{editing ? "Edit Expense" : "Add Recurring Expense"}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Store Rent — C Autoparts" className={fieldClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount (₱) *</label>
                  <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldClass} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Due Day of Month *</label>
                <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} className={fieldClass} />
                <p className="mt-0.5 text-[10px] text-muted-foreground">1-31. Use 31 for last day of month.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldClass} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleSave} disabled={!name || !amount} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {editing ? "Update" : "Add"} Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getOrdinal(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  const last = n % 10;
  if (last === 1) return "st";
  if (last === 2) return "nd";
  if (last === 3) return "rd";
  return "th";
}
