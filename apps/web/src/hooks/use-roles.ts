"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ── Types ── */
export interface PermissionItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: "POS" | "BACKOFFICE";
  sortOrder: number;
}

export interface RoleListItem {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
  permissionCount: number;
  employeeCount: number;
}

export interface RoleDetail {
  id: string;
  orgId: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: string[]; // array of permission keys
}

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  roleId: string | null;
  roleName: string | null;
  primaryLocationId: string | null;
  createdAt: string;
}

/* ── Hooks ── */
export function usePermissionsList(token: string, locationId: string) {
  return useQuery<{ data: { POS: PermissionItem[]; BACKOFFICE: PermissionItem[] } }>({
    queryKey: ["rbac-permissions"],
    queryFn: () =>
      apiFetch<{ data: { POS: PermissionItem[]; BACKOFFICE: PermissionItem[] } }>("/rbac/permissions", { token, locationId }),
    enabled: !!token,
    staleTime: 300_000,
  });
}

export function useRoles(token: string, locationId: string) {
  return useQuery<{ data: RoleListItem[] }>({
    queryKey: ["rbac-roles"],
    queryFn: () => apiFetch<{ data: RoleListItem[] }>("/rbac/roles", { token, locationId }),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useRoleDetail(token: string, locationId: string, roleId: string | null) {
  return useQuery<RoleDetail>({
    queryKey: ["rbac-role", roleId],
    queryFn: () => apiFetch<RoleDetail>(`/rbac/roles/${roleId}`, { token, locationId }),
    enabled: !!token && !!roleId,
    staleTime: 30_000,
  });
}

export function useCreateRole(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; permissionKeys: string[] }) =>
      apiFetch<RoleDetail>("/rbac/roles", { token, locationId, method: "POST", body: input as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac-roles"] }),
  });
}

export function useUpdateRole(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; permissionKeys?: string[] }) =>
      apiFetch<RoleDetail>(`/rbac/roles/${id}`, { token, locationId, method: "PUT", body: input as any }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
      qc.invalidateQueries({ queryKey: ["rbac-role", vars.id] });
    },
  });
}

export function useDeleteRole(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/rbac/roles/${id}`, { token, locationId, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rbac-roles"] }),
  });
}

export function useEmployees(token: string, locationId: string) {
  return useQuery<{ data: UserRow[] }>({
    queryKey: ["employees"],
    queryFn: () => apiFetch<{ data: UserRow[] }>("/rbac/employees", { token, locationId }),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useAssignRole(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      apiFetch(`/rbac/users/${userId}/role`, { token, locationId, method: "PUT", body: { roleId } as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["rbac-roles"] });
    },
  });
}
