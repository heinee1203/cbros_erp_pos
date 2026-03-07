import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apex Auto Parts — Admin",
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
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden w-60 shrink-0 border-r border-border bg-muted/30 md:block">
            <div className="flex h-14 items-center gap-2 border-b border-border px-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                A
              </div>
              <span className="text-sm font-semibold">Apex Auto Parts</span>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              <NavItem href="/" label="Inventory" active />
              <NavItem href="/transfers" label="Transfers" />
              <NavItem href="/families" label="Families" />
              <NavItem href="/suppliers" label="Suppliers" />
              <NavItem href="/settings" label="Settings" />
            </nav>
          </aside>

          {/* Main area */}
          <div className="flex flex-1 flex-col">
            {/* Top bar */}
            <header className="flex h-14 items-center justify-between border-b border-border px-6">
              <h1 className="text-sm font-medium text-muted-foreground">
                Dashboard
              </h1>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Central Warehouse
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  AU
                </div>
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

function NavItem({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      className={`rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-primary/5 font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {label}
    </a>
  );
}
