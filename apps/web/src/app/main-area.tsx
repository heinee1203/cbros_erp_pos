"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSidebar } from "./sidebar-context";
import { useAuth, type LocationInfo } from "./auth-context";
import { cn } from "@/lib/utils";
import {
  MapPin,
  ChevronDown,
  Check,
  Warehouse,
  Store,
  Building2,
  LogOut,
  Menu,
} from "lucide-react";

/* ─────────────────────────────────────────────
 * Location type icon helper
 * ───────────────────────────────────────────── */
function LocationIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "WAREHOUSE":
      return <Warehouse size={14} className={className} />;
    case "RETAIL_STORE":
    case "STORE":
      return <Store size={14} className={className} />;
    default:
      return <Building2 size={14} className={className} />;
  }
}

/* ─────────────────────────────────────────────
 * Location Selector Dropdown
 * ───────────────────────────────────────────── */
function LocationSelector() {
  const { locationId, locations, setLocationId } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const activeLocation = locations.find((l) => l.id === locationId);
  const displayName = activeLocation?.name ?? "Select Location";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors",
          open
            ? "border-primary/40 bg-primary/[0.04] text-foreground ring-2 ring-primary/[0.08]"
            : "border-border bg-background text-foreground hover:bg-muted",
        )}
      >
        {activeLocation ? (
          <LocationIcon
            type={activeLocation.type}
            className="text-muted-foreground"
          />
        ) : (
          <MapPin size={14} className="text-muted-foreground" />
        )}
        <span className="max-w-[180px] truncate">{displayName}</span>
        <ChevronDown
          size={12}
          className={cn(
            "text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[260px] rounded-xl border border-border bg-background p-1.5 shadow-xl animate-in fade-in slide-in-from-top-1 duration-100">
          <div className="mb-1.5 px-2.5 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Switch Location
            </span>
          </div>
          {locations.map((loc) => {
            const isActive = loc.id === locationId;
            return (
              <button
                key={loc.id}
                onClick={() => {
                  setLocationId(loc.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  isActive
                    ? "bg-primary/[0.06] text-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <LocationIcon
                  type={loc.type}
                  className={cn(
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{loc.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {loc.type.replace(/_/g, " ")}
                  </div>
                </div>
                {isActive && (
                  <Check size={14} className="shrink-0 text-primary" />
                )}
              </button>
            );
          })}
          {locations.length === 0 && (
            <div className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">
              No locations available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Main Area
 * ───────────────────────────────────────────── */
export function MainArea({ children }: { children: ReactNode }) {
  const { isCollapsed, openMobile } = useSidebar();
  const { user, logout } = useAuth();
  const router = useRouter();

  const initials = user
    ? user.fullName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  return (
    <div
      className={cn(
        "flex flex-1 flex-col transition-[margin-left] duration-200 ease-out",
        isCollapsed ? "md:ml-16" : "md:ml-[252px]",
      )}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {/* Mobile hamburger */}
          <button
            onClick={openMobile}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border shadow-sm md:hidden"
          >
            <Menu size={18} />
          </button>
          <div className="hidden h-1.5 w-1.5 rounded-full bg-success md:block" />
          <span className="text-[13px] font-medium text-foreground">
            Apex Auto Parts
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="text-[13px] text-muted-foreground">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Location switcher */}
          <LocationSelector />

          {/* Separator */}
          <div className="h-6 w-px bg-border" />

          {/* User avatar */}
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-[11px] font-semibold text-primary-foreground ring-2 ring-background shadow-sm">
              {initials}
            </div>
            <div className="hidden text-left lg:block">
              <div className="text-[13px] font-medium leading-none text-foreground">
                {user?.fullName ?? "Loading..."}
              </div>
              <div className="mt-0.5 text-[11px] leading-none text-muted-foreground">
                {user?.email ?? ""}
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 bg-muted/30 p-6">{children}</main>
    </div>
  );
}
