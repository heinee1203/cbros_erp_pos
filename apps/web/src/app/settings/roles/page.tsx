"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Users, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  permissionCount: number;
  employeeCount: number;
}

interface RoleDetail extends Role {
  permissions: string[];
}

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  sortOrder: number;
}

export default function RolesPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<{ POS: Permission[]; BACKOFFICE: Permission[] }>({ POS: [], BACKOFFICE: [] });
  const [loading, setLoading] = useState(true);
  const [editRole, setEditRole] = useState<RoleDetail | null>(null);
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editName, setEditName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiFetch<{ data: Role[] }>("/rbac/roles", { token, locationId }),
        apiFetch<{ data: { POS: Permission[]; BACKOFFICE: Permission[] } }>("/rbac/permissions", { token, locationId }),
      ]);
      setRoles(rolesRes.data);
      setAllPerms(permsRes.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  const openEdit = async (role: Role) => {
    const detail = await apiFetch<RoleDetail>(`/rbac/roles/${role.id}`, { token: token!, locationId: locationId! });
    setEditRole(detail);
    setEditPerms(new Set(detail.permissions));
    setEditName(detail.name);
  };

  const openCreate = () => {
    setShowCreate(true);
    setEditRole(null);
    setEditPerms(new Set());
    setEditName("");
  };

  const togglePerm = (key: string) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    const permissionKeys = Array.from(editPerms);
    if (editRole) {
      await apiFetch(`/rbac/roles/${editRole.id}`, {
        token: token!, locationId: locationId!, method: "PUT",
        body: { name: editName, permissionKeys },
      });
    } else {
      await apiFetch("/rbac/roles", {
        token: token!, locationId: locationId!, method: "POST",
        body: { name: editName, permissionKeys },
      });
    }
    setEditRole(null);
    setShowCreate(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/rbac/roles/${id}`, { token: token!, locationId: locationId!, method: "DELETE" });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Cannot delete role");
    }
  };

  const isEditing = editRole || showCreate;

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Roles & Permissions</h2>
          <p className="text-sm text-muted-foreground">Configure what each role can access</p>
        </div>
        <button onClick={openCreate} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1 inline h-4 w-4" /> New Role
        </button>
      </div>

      {/* Roles table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Permissions</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Employees</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => (
              <tr key={r.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.name}</span>
                    {r.isSystem && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">SYSTEM</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">{r.permissionCount}</td>
                <td className="px-3 py-2 text-center">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3 w-3" /> {r.employeeCount}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => openEdit(r)} className="text-xs font-medium text-primary hover:underline">Edit</button>
                  {!r.isSystem && r.employeeCount === 0 && (
                    <button onClick={() => handleDelete(r.id)} className="ml-2 text-xs font-medium text-destructive hover:underline">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit/Create Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setEditRole(null); setShowCreate(false); }}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold">
              {editRole ? `Edit Role: ${editRole.name}` : "Create New Role"}
              {editRole?.isSystem && <span className="ml-2 text-xs text-muted-foreground">(system role — name cannot be changed)</span>}
            </h3>

            {/* Name */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Role Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={editRole?.isSystem}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
            </div>

            {/* POS Permissions */}
            <div className="mb-4">
              <h4 className="mb-1 text-sm font-semibold">POS Permissions</h4>
              <p className="mb-2 text-[10px] text-muted-foreground">Employees can use the POS app with these capabilities</p>
              <div className="space-y-1.5">
                {allPerms.POS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editPerms.has(p.key)} onChange={() => togglePerm(p.key)} className="rounded" />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Back Office Permissions */}
            <div className="mb-4">
              <h4 className="mb-1 text-sm font-semibold">Back Office Permissions</h4>
              <p className="mb-2 text-[10px] text-muted-foreground">Employees can access the web dashboard with these capabilities</p>
              <div className="space-y-1.5">
                {allPerms.BACKOFFICE.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editPerms.has(p.key)} onChange={() => togglePerm(p.key)} className="rounded" />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-between border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">{editPerms.size} of {allPerms.POS.length + allPerms.BACKOFFICE.length} permissions selected</div>
              <div className="flex gap-2">
                <button onClick={() => { setEditRole(null); setShowCreate(false); }} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
                <button onClick={handleSave} disabled={!editName.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {editRole ? "Save Changes" : "Create Role"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
