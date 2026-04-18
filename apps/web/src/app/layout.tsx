import type { Metadata } from "next";
import { Toaster } from "sonner";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";
import { AuthProvider } from "./auth-context";
import { AppShell } from "./app-shell";

export const metadata: Metadata = {
  title: "CBROS Genuine Autoparts \u2014 Admin",
  description: "Automotive ERP & POS Administration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <QueryProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </QueryProvider>
        {/* Global toast host — rendered at body level so toasts survive modal dismissal. */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          expand={false}
          duration={4000}
        />
      </body>
    </html>
  );
}
