"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

export interface LocationRow {
  id: string;
  name: string;
  code: string;
  type: string;
  address: string | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationPayload {
  name: string;
  code: string;
  type: string;
  address?: string;
}

export interface UpdateLocationPayload {
  name?: string;
  code?: string;
  type?: string;
  address?: string | null;
}

interface MutationOptions {
  onSettled?: () => void;
}

/* ─────────────────────────────────────────────
 * Query: List locations
 * ───────────────────────────────────────────── */

export function useLocations(token: string, includeInactive = false) {
  return useQuery<{ data: LocationRow[] }>({
    queryKey: ["locations", includeInactive],
    queryFn: () => {
      const params = includeInactive ? "?includeInactive=true" : "";
      return apiFetch<{ data: LocationRow[] }>(`/locations${params}`, { token });
    },
    enabled: !!token,
    staleTime: 30_000,
  });
}

/* ─────────────────────────────────────────────
 * Mutation: Create location
 * ───────────────────────────────────────────── */

export function useCreateLocation(token: string, opts?: MutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateLocationPayload) =>
      apiFetch<{ data: LocationRow }>("/locations", {
        token,
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      opts?.onSettled?.();
    },
  });
}

/* ─────────────────────────────────────────────
 * Mutation: Update location
 * ───────────────────────────────────────────── */

export function useUpdateLocation(token: string, opts?: MutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateLocationPayload & { id: string }) =>
      apiFetch<{ data: LocationRow }>(`/locations/${id}`, {
        token,
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      opts?.onSettled?.();
    },
  });
}

/* ─────────────────────────────────────────────
 * Mutation: Deactivate (soft-delete) location
 * ───────────────────────────────────────────── */

export function useDeleteLocation(token: string, opts?: MutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: LocationRow }>(`/locations/${id}`, {
        token,
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      opts?.onSettled?.();
    },
  });
}

/* ─────────────────────────────────────────────
 * Mutation: Reactivate location
 * ───────────────────────────────────────────── */

export function useReactivateLocation(token: string, opts?: MutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: LocationRow }>(`/locations/${id}/reactivate`, {
        token,
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      opts?.onSettled?.();
    },
  });
}
