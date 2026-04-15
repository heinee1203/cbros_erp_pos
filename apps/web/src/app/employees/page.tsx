"use client";

import { useState } from "react";
import { UserCog, Shield, Mail, MapPin, Loader2, Check, Users, X, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useLocations } from "@/hooks/use-locations";
import { useRoles, useEmployees, useAssignRole, type UserRow } from "@/hooks/use-roles";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const LEGACY_ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-500/10 text-purple-600",
  MANAGER: "bg-blue-500/10 text-blue-600",
  CASHIER: "bg-emerald-500/10 text-emerald-600",
  WAREHOUSE_STAFF: "bg-slate-500/10 text-slate-600",
};

export default function EmployeesPage() {
  const { token, locationId } = useAuth();
  const rolesQuery = useRoles(token, locationId);
  const employeesQuery = useEmployees(token, locationId);
  const locationsQuery = useLocations(token);
  const assignMut = useAssignRole(token, locationId);

  const qc = useQueryClient();
  const seedMut = useMutation({
    mutationFn: () => apiFetch<{ seeded: number; linked: number; message: string; names: string[]; defaultPassword: string }>("/rbac/seed-cashiers", { token, locationId, method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const allRoles = rolesQuery.data?.data ?? [];
  const employees = employeesQuery.data?.data ?? [];
  const locations = locationsQuery.data?.data ?? [];
  const locationMap = new Map(locations.map((l) => [l.id, l.name]));

  const [successId, setSuccessId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showResult = (type: "success" | "error", message: string) => {
    setActionResult({ type, message });
    setTimeout(() => setActionResult(null), 10000);
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
    try {
      await assignMut.mutateAsync({ userId, roleId });
      setSuccessId(userId);
      setTimeout(() => setSuccessId(null), 2000);
    } catch {}
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><UserCog size={16} className="text-primary" /></div>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Employee List</h1>
              <p className="text-[13px] text-muted-foreground">Manage employees and assign roles for access control</p>
            </div>
          </div>
          {employees.length <= 1 && (
            <button
              onClick={async () => {
                try {
                  const res = await seedMut.mutateAsync();
                  showResult("success", `${res.message}. Default password: ${res.defaultPassword}`);
                } catch (err: any) {
                  showResult("error", `Seed failed: ${err?.message || "Unknown error"}`);
                }
              }}
              disabled={seedMut.isPending}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              {seedMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
              Seed CBROS Cashiers
            </button>
          )}
        </div>

        <div className="mt-4 flex gap-5 text-[13px]">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><UserCog size={11} className="text-muted-foreground" /></div>
            <span className="text-muted-foreground">Employees</span>
            <span className="font-semibold tabular-nums text-foreground">{employees.length}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Shield size={11} className="text-muted-foreground" /></div>
            <span className="text-muted-foreground">Roles</span>
            <span className="font-semibold tabular-nums text-foreground">{allRoles.length}</span>
          </div>
        </div>
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div className={cn("mb-3 flex items-center gap-2 rounded-lg border px-4 py-1.5 text-[12px]",
          actionResult.type === "success"
            ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"
            : "border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800"
        )}>
          <Database size={14} className={actionResult.type === "success" ? "text-emerald-600" : "text-red-600"} />
          <span className={actionResult.type === "success" ? "text-emerald-800 dark:text-emerald-200" : "text-red-800 dark:text-red-200"}>
            {actionResult.message}
          </span>
          <button onClick={() => setActionResult(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-[1fr_160px_140px_140px] gap-1 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span>Employee</span>
          <span>Legacy Role</span>
          <span>RBAC Role</span>
          <span>Branch</span>
        </div>

        {employeesQuery.isLoading ? (
          <div className="flex h-48 items-center justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
        ) : employees.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <UserCog size={24} className="text-muted-foreground/30" />
            <p className="text-sm font-medium">No employees</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {employees.map((emp: UserRow) => (
              <div key={emp.id} className="grid grid-cols-[1fr_160px_140px_140px] gap-1 px-4 py-3 items-center hover:bg-accent/30 transition-colors">
                {/* Name + email */}
                <div className="min-w-0">
                  <span className="text-[13px] font-medium text-foreground block truncate">{emp.fullName}</span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail size={9} /> {emp.email}</span>
                </div>
                {/* Legacy role badge */}
                <div>
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
                    LEGACY_ROLE_COLORS[emp.role] ?? "bg-muted text-muted-foreground")}>
                    {emp.role}
                  </span>
                </div>
                {/* RBAC role dropdown */}
                <div className="flex items-center gap-1">
                  <select
                    value={emp.roleId ?? ""}
                    onChange={(e) => e.target.value && handleRoleChange(emp.id, e.target.value)}
                    className="h-7 w-full rounded-lg border border-border bg-background px-1.5 text-[11px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                  >
                    <option value="">Not assigned</option>
                    {allRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {successId === emp.id && <Check size={14} className="text-emerald-500 flex-shrink-0" />}
                </div>
                {/* Branch */}
                <div className="text-[12px] text-muted-foreground truncate">
                  {emp.primaryLocationId ? (locationMap.get(emp.primaryLocationId) ?? "—") : (
                    <span className="flex items-center gap-1"><MapPin size={10} /> All</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{employees.length} employees</span>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
        <p><strong>RBAC Role</strong> overrides the legacy role for permission checks. When assigned, the user&apos;s sidebar and actions are filtered by the role&apos;s permissions.</p>
        <p className="mt-1">Permissions take effect on the user&apos;s next login (JWT refresh).</p>
      </div>
    </div>
  );
}
