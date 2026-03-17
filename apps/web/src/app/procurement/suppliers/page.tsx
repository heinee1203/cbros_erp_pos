"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, X, Package, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSuppliers, type SupplierRow } from "@/hooks/use-suppliers";
import { useConfirm } from "@/components/confirm-dialog";
import { apiFetch } from "@/lib/api";

type ModalMode = "closed" | "create" | "edit";

interface SupplierForm {
  name: string;
  mnemonicCode: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
}

const emptyForm: SupplierForm = {
  name: "",
  mnemonicCode: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
};

export default function SuppliersPage() {
  const { token, locationId } = useAuth();
  const suppliersQuery = useSuppliers(token, locationId);
  const confirm = useConfirm();
  const [search, setSearch] = useState("");

  const [modalMode, setModalMode] = useState<ModalMode>("closed");
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const suppliers = suppliersQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contactEmail?.toLowerCase().includes(q) ?? false) ||
        (s.contactPhone?.toLowerCase().includes(q) ?? false) ||
        (s.address?.toLowerCase().includes(q) ?? false)
    );
  }, [suppliers, search]);

  useEffect(() => {
    if (modalMode === "edit" && editingSupplier) {
      setForm({
        name: editingSupplier.name,
        mnemonicCode: editingSupplier.mnemonicCode ?? "",
        contactEmail: editingSupplier.contactEmail ?? "",
        contactPhone: editingSupplier.contactPhone ?? "",
        address: editingSupplier.address ?? "",
      });
    } else if (modalMode === "create") {
      setForm(emptyForm);
    }
  }, [modalMode, editingSupplier]);

  const closeModal = () => {
    setModalMode("closed");
    setEditingSupplier(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        mnemonicCode: form.mnemonicCode.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        address: form.address.trim() || undefined,
      };

      if (modalMode === "create") {
        await apiFetch("/procurement/suppliers", {
          method: "POST",
          body: JSON.stringify(payload),
          token,
          locationId,
        });
      } else if (editingSupplier) {
        await apiFetch(`/procurement/suppliers/${editingSupplier.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          token,
          locationId,
        });
      }

      closeModal();
      suppliersQuery.refetch();
    } catch (err: any) {
      alert(err.message || "Failed to save supplier");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (supplier: SupplierRow) => {
    const ok = await confirm({
      title: "Delete Supplier",
      message: `Delete "${supplier.name}"? This cannot be undone. Suppliers with existing purchase orders cannot be deleted.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await apiFetch(`/procurement/suppliers/${supplier.id}`, {
        method: "DELETE",
        token,
        locationId,
      });
      suppliersQuery.refetch();
    } catch (err: any) {
      alert(err.message || "Cannot delete supplier — may have existing POs");
    }
  };

  if (suppliersQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Suppliers</h2>
          <p className="text-sm text-muted-foreground">
            Vendor directory for procurement and purchase orders
          </p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Suppliers</h2>
          <p className="text-sm text-muted-foreground">
            Vendor directory for procurement and purchase orders
          </p>
        </div>
        <button
          onClick={() => {
            setModalMode("create");
            setEditingSupplier(null);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          Add Supplier
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Supplier
              </th>
              <th scope="col" className="w-[70px] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Code
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Phone
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Address
              </th>
              <th scope="col" className="w-20 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Package size={16} className="text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      No suppliers found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search ? "Try adjusting your search" : "No suppliers have been added yet"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s, i) => (
                <tr
                  key={s.id}
                  onClick={() => {
                    setEditingSupplier(s);
                    setModalMode("edit");
                  }}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-accent/50",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 text-sm font-medium">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">
                    {s.mnemonicCode ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.contactEmail ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.contactPhone ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {s.address ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSupplier(s);
                          setModalMode("edit");
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {filtered.length} supplier{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalMode !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {modalMode === "create" ? "Add Supplier" : "Edit Supplier"}
              </h3>
              <button onClick={closeModal} className="rounded p-1 hover:bg-muted">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. PhilParts Distributor"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Code (2 letters)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={form.mnemonicCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, mnemonicCode: e.target.value.toUpperCase() }))}
                    placeholder="PP"
                    className="w-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono uppercase"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                    placeholder="orders@supplier.com"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  <input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                    placeholder="+63-2-8888-1234"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Street, City, Province"
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || isSaving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSaving
                  ? "Saving..."
                  : modalMode === "create"
                    ? "Add Supplier"
                    : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
