"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/app/auth-context";

interface PermissionGateProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wraps page content and only renders children if the user has the required permission.
 * Shows an "Access Denied" message otherwise.
 */
export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const hasAccess = !permission || permissions.includes(permission);

  if (!hasAccess) {
    return fallback ?? (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-3 h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">You don't have permission to view this page.</p>
        <Link href="/dashboard" className="mt-4 text-sm font-medium text-primary hover:underline">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Hook to check if the current user has a specific permission.
 */
export function usePermission(key: string): boolean {
  const { user } = useAuth();
  return (user?.permissions ?? []).includes(key);
}

/**
 * Hook to check if the current user has any of the given permissions.
 */
export function useAnyPermission(keys: string[]): boolean {
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  return keys.some((k) => perms.includes(k));
}
