"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Crown,
  Users,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  usePermissionsList,
  useRoles,
  useRoleDetail,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  type RoleListItem,
  type PermissionItem,
} from "@/hooks/use-roles";

/* ── Permission groups for display ── */
const PERMISSION_GROUPS: { label: string; icon: string; keys: string[] }[] = [
  { label: "Dashboard", icon: "\uD83D\uDCCA", keys: ["bo.view_sales_reports"] },
  { label: "Point of Sale", icon: "\uD83D\uDED2", keys: [
    "pos.accept_payments", "pos.apply_discounts", "pos.perform_refunds",
    "pos.void_sale", "pos.manual_price_override", "pos.open_cash_drawer",
    "pos.view_receipts", "pos.reprint_receipts", "pos.view_shift_report",
    "pos.force_close_shift", "pos.change_taxes",
  ]},
  { label: "Inventory", icon: "\uD83D\uDCE6", keys: ["bo.manage_inventory", "bo.manage_items"] },
  { label: "Products", icon: "\uD83C\uDFF7\uFE0F", keys: ["pos.manage_items"] },
  { label: "Pricing & Cost", icon: "\uD83D\uDCB0", keys: ["pos.view_cost", "bo.view_cost"] },
  { label: "Purchase Orders", icon: "\uD83D\uDCCB", keys: ["bo.manage_purchase_orders", "bo.manage_suppliers"] },
  { label: "Reports", icon: "\uD83D\uDCC8", keys: ["bo.view_demand_reports", "bo.cancel_receipts"] },
  { label: "Customers", icon: "\uD83D\uDC65", keys: ["bo.manage_customers"] },
  { label: "Employees", icon: "\uD83D\uDD27", keys: ["bo.manage_employees"] },
  { label: "Settings", icon: "\u2699\uFE0F", keys: [
    "bo.manage_settings", "bo.manage_billing", "bo.manage_payment_types",
    "bo.manage_taxes", "bo.manage_pos_devices", "pos.change_settings",
  ]},
];

/* ── Role level icon ── */
function RoleIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes("owner")) return <Crown size={14} className="text-amber-500" />;
  if (n.includes("admin")) return <Shield size={14} className="text-purple-500" />;
  if (n.includes("manager")) return <Shield size={14} className="text-blue-500" />;
  return <Users size={14} className="text-muted-foreground" />;
}

/* ═════════════════════════════════════════════════════════
 * Create Role Form
 * ═════���═════════════════════════��═════════════════════════ */
function CreateRoleForm({ roles, onSave, onClose, saving }: {
  roles: RoleListItem[];
  onSave: (name: string, templateRoleId?: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");

  return (
    <div className="mb-4 rounded-xl border border-primary/20 bg-primary/[0.02] p-4">
      <h3 className="text-[13px] font-semibold text-foreground mb-3">Create Custom Role</h3>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Cashier"
            className="h-8 w-48 rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Copy permissions from</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
            className="h-8 w-40 rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40">
            <option value="">None (empty)</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button onClick={() => name.trim() && onSave(name.trim(), templateId || undefined)} disabled={saving || !name.trim()}
          className="h-8 rounded-lg bg-primary px-4 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
          {saving && <Loader2 size={12} className="animate-spin" />} Create
        </button>
        <button onClick={onClose} className="h-8 rounded-lg border border-border px-3 text-[12px] text-muted-foreground hover:bg-muted">Cancel</button>
      </div>
    </div>
  );
}

/* ══════��══════════════���═══════════════════════════════════
 * Permission Matrix
 * ══════════════════════���══════════════════════════════════ */
function PermissionMatrix({ allRoles, allPermissions, onSave, saving }: {
  allRoles: Array<RoleListItem & { permissions?: string[] }>;
  allPermissions: PermissionItem[];
  onSave: (roleId: string, permissionKeys: string[]) => void;
  saving: boolean;
}) {
  // Load all role details
  const { token, locationId } = useAuth();
  const [editedPerms, setEditedPerms] = useState<Record<string, Set<string>>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  // Build permission lookup
  const permMap = useMemo(() => new Map(allPermissions.map((p) => [p.key, p])), [allPermissions]);

  // Fetch all role details
  const roleQueries = allRoles.map((r) => {
    const q = useRoleDetail(token, locationId, r.id);
    return { roleId: r.id, data: q.data, isLoading: q.isLoading };
  });

  const getRolePerms = useCallback((roleId: string): Set<string> => {
    if (editedPerms[roleId]) return editedPerms[roleId];
    const rq = roleQueries.find((q) => q.roleId === roleId);
    return new Set(rq?.data?.permissions ?? []);
  }, [roleQueries, editedPerms]);

  const togglePerm = (roleId: string, key: string) => {
    const role = allRoles.find((r) => r.id === roleId);
    if (role?.name === "Owner" || role?.name === "Administrator") return; // read-only
    const current = new Set(getRolePerms(roleId));
    if (current.has(key)) current.delete(key); else current.add(key);
    setEditedPerms((prev) => ({ ...prev, [roleId]: current }));
  };

  const hasEdits = (roleId: string): boolean => !!editedPerms[roleId];

  const handleSave = async (roleId: string) => {
    const perms = editedPerms[roleId];
    if (!perms) return;
    setSavingRoleId(roleId);
    onSave(roleId, Array.from(perms));
    // Clear edits after save
    setTimeout(() => {
      setEditedPerms((prev) => { const n = { ...prev }; delete n[roleId]; return n; });
      setSavingRoleId(null);
    }, 500);
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const isLoading = roleQueries.some((q) => q.isLoading);
  if (isLoading) return <div className="flex items-center gap-2 py-8 justify-center text-[12px] text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading permissions...</div>;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      {/* Header row with role names */}
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 sticky top-0 z-10">
        <div className="w-60 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex-shrink-0">Permission</div>
        {allRoles.map((r) => (
          <div key={r.id} className="w-24 text-center flex-shrink-0">
            <div className="flex items-center justify-center gap-1">
              <RoleIcon name={r.name} />
              <span className="text-[10px] font-semibold text-foreground truncate">{r.name}</span>
            </div>
            <span className="text-[9px] text-muted-foreground">{r.employeeCount} users</span>
          </div>
        ))}
      </div>

      {/* Permission groups */}
      {PERMISSION_GROUPS.map((group) => {
        const groupPerms = group.keys.filter((k) => permMap.has(k));
        if (groupPerms.length === 0) return null;
        const isCollapsed = collapsedGroups.has(group.label);

        return (
          <div key={group.label}>
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex w-full items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border/50 hover:bg-muted/40 transition-colors"
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <span className="text-[10px]">{group.icon}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{group.label}</span>
              <span className="text-[10px] text-muted-foreground">({groupPerms.length})</span>
            </button>

            {/* Permission rows */}
            {!isCollapsed && groupPerms.map((key) => {
              const perm = permMap.get(key)!;
              return (
                <div key={key} className="flex items-center px-4 py-2 border-b border-border/30 hover:bg-accent/20 transition-colors">
                  <div className="w-60 flex-shrink-0 pr-4">
                    <span className="text-[12px] text-foreground">{perm.name}</span>
                    {perm.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{perm.description}</p>
                    )}
                  </div>
                  {allRoles.map((r) => {
                    const perms = getRolePerms(r.id);
                    const has = perms.has(key);
                    const isOwner = r.name === "Owner" || r.name === "Administrator";
                    return (
                      <div key={r.id} className="w-24 flex justify-center flex-shrink-0">
                        <button
                          onClick={() => togglePerm(r.id, key)}
                          disabled={isOwner}
                          className={cn(
                            "h-6 w-6 rounded-md flex items-center justify-center transition-colors",
                            has ? "bg-emerald-500/15 text-emerald-600" : "bg-muted/50 text-muted-foreground/30",
                            !isOwner && "hover:bg-emerald-500/25 cursor-pointer",
                            isOwner && "cursor-not-allowed opacity-70",
                          )}
                        >
                          {has ? <Check size={13} strokeWidth={2.5} /> : <X size={11} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Save row per role */}
      <div className="flex items-center px-4 py-3 border-t border-border bg-muted/30">
        <div className="w-60 flex-shrink-0 text-[11px] font-medium text-muted-foreground">Save changes:</div>
        {allRoles.map((r) => (
          <div key={r.id} className="w-24 flex justify-center flex-shrink-0">
            {hasEdits(r.id) ? (
              <button
                onClick={() => handleSave(r.id)}
                disabled={savingRoleId === r.id}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingRoleId === r.id ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                Save
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════��══════════════════════════
 * Main Page
 * ═══���═════════════════��═══════════════════════════════════ */
export default function RolesPage() {
  const { token, locationId } = useAuth();
  const rolesQuery = useRoles(token, locationId);
  const permsQuery = usePermissionsList(token, locationId);
  const createMut = useCreateRole(token, locationId);
  const updateMut = useUpdateRole(token, locationId);
  const deleteMut = useDeleteRole(token, locationId);

  const [showCreate, setShowCreate] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const allRoles = rolesQuery.data?.data ?? [];
  const allPermissions = [
    ...(permsQuery.data?.data?.POS ?? []),
    ...(permsQuery.data?.data?.BACKOFFICE ?? []),
  ];

  const showMsg = (type: "success" | "error", text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 5000);
  };

  const handleCreate = async (name: string, templateRoleId?: string) => {
    try {
      let permissionKeys: string[] = [];
      if (templateRoleId) {
        const detail = allRoles.find((r) => r.id === templateRoleId);
        // fetch template perms
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/rbac/roles/${templateRoleId}`, {
          headers: { Authorization: `Bearer ${token}`, "X-Location-ID": locationId },
        });
        if (res.ok) {
          const data = await res.json();
          permissionKeys = data.permissions ?? [];
        }
      }
      await createMut.mutateAsync({ name, permissionKeys });
      setShowCreate(false);
      showMsg("success", `Role "${name}" created`);
    } catch (err: any) {
      showMsg("error", err?.message || "Failed to create role");
    }
  };

  const handleSavePerms = async (roleId: string, permissionKeys: string[]) => {
    try {
      await updateMut.mutateAsync({ id: roleId, permissionKeys });
      showMsg("success", "Permissions saved");
    } catch (err: any) {
      showMsg("error", err?.message || "Failed to save");
    }
  };

  const handleDelete = async (role: RoleListItem) => {
    if (role.isSystem) return;
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await deleteMut.mutateAsync(role.id);
      showMsg("success", `Role "${role.name}" deleted`);
    } catch (err: any) {
      showMsg("error", err?.message || "Failed to delete");
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Shield size={16} className="text-primary" /></div>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Roles & Access</h1>
              <p className="text-[13px] text-muted-foreground">Define employee roles and control access to system features</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> Create Role
          </button>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={cn("mb-3 flex items-center gap-2 rounded-lg border px-4 py-2 text-[12px]",
          actionMsg.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800"
            : "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200 dark:border-red-800"
        )}>
          {actionMsg.text}
          <button onClick={() => setActionMsg(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateRoleForm
          roles={allRoles}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
          saving={createMut.isPending}
        />
      )}

      {/* Roles list */}
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Role</div>
          <div className="w-24 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Permissions</div>
          <div className="w-20 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Users</div>
          <div className="w-16 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Type</div>
          <div className="w-16" />
        </div>

        {rolesQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
        ) : allRoles.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <Shield size={24} className="text-muted-foreground/30" />
            <p className="text-sm font-medium">No roles defined</p>
            <p className="text-xs text-muted-foreground">Roles are seeded automatically. Check the API.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allRoles.map((role) => (
              <div key={role.id} className="flex items-center px-4 py-3 hover:bg-accent/30 transition-colors">
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <RoleIcon name={role.name} />
                  <span className="text-[13px] font-medium text-foreground">{role.name}</span>
                </div>
                <div className="w-24 text-center text-[12px] tabular-nums text-foreground">{role.permissionCount}</div>
                <div className="w-20 text-center text-[12px] tabular-nums text-foreground">{role.employeeCount}</div>
                <div className="w-16">
                  {role.isSystem ? (
                    <span className="inline-flex rounded-md bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-600">System</span>
                  ) : (
                    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">Custom</span>
                  )}
                </div>
                <div className="w-16 flex justify-end">
                  {!role.isSystem && role.employeeCount === 0 && (
                    <button onClick={() => handleDelete(role)} className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permission Matrix */}
      <div className="mb-2">
        <h2 className="text-[14px] font-semibold text-foreground mb-1">Permission Matrix</h2>
        <p className="text-[12px] text-muted-foreground mb-3">Click checkmarks to toggle permissions. Owner/Administrator roles are read-only. Save per-role after editing.</p>
      </div>

      {allRoles.length > 0 && allPermissions.length > 0 && (
        <PermissionMatrix
          allRoles={allRoles}
          allPermissions={allPermissions}
          onSave={handleSavePerms}
          saving={updateMut.isPending}
        />
      )}
    </div>
  );
}
