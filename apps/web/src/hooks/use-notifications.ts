import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──

export interface Notification {
  id: string;
  orgId: string;
  userId: string | null;
  type: string;
  priority: "CRITICAL" | "URGENT" | "NORMAL" | "INFO";
  title: string;
  body: string | null;
  link: string | null;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  isEmailed: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSettings {
  id: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  stockoutEmailEnabled: boolean;
  stockoutInappEnabled: boolean;
  lowStockThreshold: string;
  emailAddress: string | null;
}

// ── Hooks ──

export function useUnreadCount(
  token: string | null,
  locationId: string | null,
) {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () =>
      apiFetch<{ count: number }>("/notifications/unread-count", {
        token: token!,
        locationId: locationId!,
      }),
    enabled: !!token && !!locationId,
    refetchInterval: 60000, // Poll every 60 seconds
    staleTime: 30000,
  });
}

export function useNotifications(
  token: string | null,
  locationId: string | null,
  opts: { limit?: number; type?: string; isRead?: string } = {},
) {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.type) params.set("type", opts.type);
  if (opts.isRead !== undefined) params.set("isRead", opts.isRead);
  const qs = params.toString();

  return useQuery({
    queryKey: ["notifications", "list", opts],
    queryFn: () =>
      apiFetch<{ data: Notification[]; nextCursor: string | null; hasMore: boolean }>(
        `/notifications${qs ? `?${qs}` : ""}`,
        { token: token!, locationId: locationId! },
      ),
    enabled: !!token && !!locationId,
    staleTime: 30000,
  });
}

export function useMarkRead(
  token: string | null,
  locationId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/notifications/${id}/read`, {
        token: token!,
        locationId: locationId!,
        method: "PATCH",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllRead(
  token: string | null,
  locationId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch("/notifications/mark-all-read", {
        token: token!,
        locationId: locationId!,
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useNotificationSettings(
  token: string | null,
  locationId: string | null,
) {
  return useQuery({
    queryKey: ["notifications", "settings"],
    queryFn: () =>
      apiFetch<NotificationSettings>("/notifications/settings", {
        token: token!,
        locationId: locationId!,
      }),
    enabled: !!token && !!locationId,
  });
}

export function useUpdateNotificationSettings(
  token: string | null,
  locationId: string | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<NotificationSettings>) =>
      apiFetch("/notifications/settings", {
        token: token!,
        locationId: locationId!,
        method: "PATCH",
        body: updates,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "settings"] });
    },
  });
}
