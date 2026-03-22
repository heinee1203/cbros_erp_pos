"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Trash2 } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  type Notification,
} from "@/hooks/use-notifications";

// ── Priority styling ──

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: "border-l-destructive bg-destructive/5",
  URGENT: "border-l-warning bg-warning/5",
  NORMAL: "border-l-primary bg-primary/5",
  INFO: "border-l-muted-foreground",
};

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-destructive/10 text-destructive",
  URGENT: "bg-warning/10 text-warning",
  NORMAL: "bg-primary/10 text-primary",
  INFO: "bg-muted text-muted-foreground",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "STOCKOUT", label: "Stock Alerts" },
  { key: "LOW_STOCK_DIGEST", label: "Digests" },
  { key: "PO_RECEIVED", label: "PO Updates" },
  { key: "SYSTEM", label: "System" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Page ──

export default function NotificationsPage() {
  const router = useRouter();
  const { token, locationId, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState("all");

  const queryOpts: { limit: number; type?: string; isRead?: string } = { limit: 50 };
  if (filter === "unread") {
    queryOpts.isRead = "false";
  } else if (filter !== "all") {
    queryOpts.type = filter;
  }

  const { data, isLoading, refetch } = useNotifications(token, locationId, queryOpts);
  const markRead = useMarkRead(token, locationId);
  const markAllRead = useMarkAllRead(token, locationId);

  const items = data?.data ?? [];

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link) router.push(n.link);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading notifications…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Stock alerts, digest reports, and system notifications
          </p>
        </div>
        <button
          onClick={() => markAllRead.mutate()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <Check className="mr-1 inline h-3 w-3" />
          Mark All Read
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex w-full items-start gap-3 rounded-lg border-l-4 px-4 py-3 text-left transition-colors hover:bg-accent ${
                !n.isRead
                  ? PRIORITY_STYLES[n.priority] ?? ""
                  : "border-l-transparent"
              }`}
            >
              {/* Priority dot */}
              <div className="mt-1 flex-shrink-0">
                {!n.isRead && (
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      n.priority === "CRITICAL"
                        ? "bg-destructive"
                        : n.priority === "URGENT"
                          ? "bg-warning"
                          : "bg-primary"
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm ${!n.isRead ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                  >
                    {n.title}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                      PRIORITY_BADGE[n.priority] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {n.priority}
                  </span>
                </div>
                {n.body && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                    {n.body.slice(0, 200)}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatDate(n.createdAt)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {n.type.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
