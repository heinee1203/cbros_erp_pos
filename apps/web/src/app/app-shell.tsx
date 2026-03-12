"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { Sidebar } from "./sidebar";
import { SidebarProvider } from "./sidebar-context";
import { MainArea } from "./main-area";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { Loader2 } from "lucide-react";

const PUBLIC_ROUTES = ["/login"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  // Redirect unauthenticated users to login (except on public routes)
  useEffect(() => {
    if (!loading && !isAuthenticated && !isPublicRoute) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, isPublicRoute, router]);

  // Public routes (login) — render without sidebar
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Loading auth state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not authenticated — will redirect
  if (!isAuthenticated) return null;

  // Authenticated — full app layout
  return (
    <SidebarProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <MainArea>{children}</MainArea>
        </div>
      </ConfirmProvider>
    </SidebarProvider>
  );
}
