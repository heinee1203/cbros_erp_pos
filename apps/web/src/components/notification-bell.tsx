"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import {
  useUnreadCount,
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  type Notification,
} from "@/hooks/use-notifications";

// ── Priority styling ──

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-destructive",
  URGENT: "bg-warning",
  NORMAL: "bg-primary",
  INFO: "bg-muted-foreground",
};

const PRIORITY_ICON: Record<string, string> = {
  CRITICAL: "\u26A0\uFE0F",
  URGENT: "\u26A0\uFE0F",
  NORMAL: "\uD83D\uDCE6",
  INFO: "\u2139\uFE0F",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

// ── Component ──

export function NotificationBell() {
  const { token, locationId } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Data
  const { data: countData } = useUnreadCount(token, locationId);
  const { data: listData, refetch } = useNotifications(token, locationId, {
    limit: 10,
  });
  const markRead = useMarkRead(token, locationId);
  const markAllRead = useMarkAllRead(token, locationId);

  const count = countData?.count ?? 0;
  const items = listData?.data ?? [];

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Refetch when opened
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  const handleClick = (n: Notification) => {
    if (!n.isRead) {
      markRead.mutate(n.id);
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark All Read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                    !n.isRead ? "bg-primary/5" : ""
                  }`}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!n.isRead ? (
                      <div
                        className={`h-2 w-2 rounded-full ${PRIORITY_DOT[n.priority] ?? "bg-muted-foreground"}`}
                      />
                    ) : (
                      <div className="h-2 w-2" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${!n.isRead ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
                      {PRIORITY_ICON[n.priority] ?? ""} {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body.slice(0, 100)}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 text-center">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
