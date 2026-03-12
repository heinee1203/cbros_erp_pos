"use client";

import Link from "next/link";
import { MapPin, Monitor, Receipt, Bell, Building2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const SETTINGS_SECTIONS: { icon: LucideIcon; label: string; href: string; description: string }[] = [
  { icon: MapPin, label: "Locations", href: "/settings/locations", description: "Manage stores and warehouses" },
  { icon: Monitor, label: "POS Settings", href: "/settings/pos", description: "Configure point of sale" },
  { icon: Receipt, label: "Receipt / Invoice", href: "/settings/receipts", description: "Customize receipt templates" },
  { icon: Bell, label: "Stock Alerts", href: "/settings/stock-alerts", description: "Set reorder notifications" },
  { icon: Building2, label: "Company Profile", href: "/settings/company", description: "Business information" },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your Apex POS system
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group flex items-start gap-4 rounded-xl border border-border bg-background p-5 shadow-sm transition-all hover:border-primary/20 hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <Icon size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
