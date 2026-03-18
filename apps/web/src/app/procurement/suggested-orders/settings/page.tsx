"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useReorderSettings, useUpdateReorderSettings } from "@/hooks/use-reorder";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/app/sidebar-context";

const SERVICE_LEVEL_OPTIONS = [
  { label: "90%", value: 0.9 },
  { label: "95%", value: 0.95 },
  { label: "98%", value: 0.98 },
  { label: "99%", value: 0.99 },
];

export default function ReorderSettingsPage() {
  const { token, locationId } = useAuth();
  const { isCollapsed } = useSidebar();
  const settingsQuery = useReorderSettings(token, locationId);
  const updateMut = useUpdateReorderSettings(token, locationId);

  const [defaultServiceLevel, setDefaultServiceLevel] = useState(0.95);
  const [orderCycleDays, setOrderCycleDays] = useState(14);
  const [defaultLeadTimeDays, setDefaultLeadTimeDays] = useState(7);
  const [abcA, setAbcA] = useState(0.98);
  const [abcB, setAbcB] = useState(0.95);
  const [abcC, setAbcC] = useState(0.9);
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data || initialized) return;
    const s = settingsQuery.data as Record<string, any>;
    if (s.default_service_level != null) setDefaultServiceLevel(Number(s.default_service_level));
    if (s.order_cycle_days != null) setOrderCycleDays(Number(s.order_cycle_days));
    if (s.default_lead_time_days != null) setDefaultLeadTimeDays(Number(s.default_lead_time_days));
    if (s.abc_service_levels) {
      const abc = typeof s.abc_service_levels === "string" ? JSON.parse(s.abc_service_levels) : s.abc_service_levels;
      if (abc.A != null) setAbcA(Number(abc.A));
      if (abc.B != null) setAbcB(Number(abc.B));
      if (abc.C != null) setAbcC(Number(abc.C));
    }
    setInitialized(true);
  }, [settingsQuery.data, initialized]);

  const handleSave = async () => {
    setSaved(false);
    await updateMut.mutateAsync({
      default_service_level: defaultServiceLevel,
      order_cycle_days: orderCycleDays,
      default_lead_time_days: defaultLeadTimeDays,
      abc_service_levels: { A: abcA, B: abcB, C: abcC },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className={cn("flex-1 transition-all duration-200", isCollapsed ? "md:ml-16" : "md:ml-[252px]")}>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Back link */}
        <Link
          href="/procurement/suggested-orders"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Suggested Orders
        </Link>

        <h1 className="text-xl font-semibold tracking-tight mb-6">Reorder Engine Settings</h1>

        {settingsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Loading settings...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Default Service Level */}
            <div>
              <label className="text-sm font-medium">Default Service Level</label>
              <select
                value={defaultServiceLevel}
                onChange={(e) => setDefaultServiceLevel(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {SERVICE_LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Probability of not running out of stock during lead time + review period.
              </p>
            </div>

            {/* Order Cycle Days */}
            <div>
              <label className="text-sm font-medium">Order Cycle Days</label>
              <input
                type="number"
                min={1}
                value={orderCycleDays}
                onChange={(e) => setOrderCycleDays(parseInt(e.target.value) || 14)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                How often you review and place orders (days between order reviews).
              </p>
            </div>

            {/* Default Lead Time */}
            <div>
              <label className="text-sm font-medium">Default Lead Time (fallback)</label>
              <input
                type="number"
                min={1}
                value={defaultLeadTimeDays}
                onChange={(e) => setDefaultLeadTimeDays(parseInt(e.target.value) || 7)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used when no supplier lead time data is available for an item.
              </p>
            </div>

            {/* ABC Service Levels */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-3">ABC Classification Service Levels</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Override the default service level per ABC class. A-class items (high revenue) get higher protection.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">A-class</label>
                  <select
                    value={abcA}
                    onChange={(e) => setAbcA(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {SERVICE_LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">B-class</label>
                  <select
                    value={abcB}
                    onChange={(e) => setAbcB(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {SERVICE_LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">C-class</label>
                  <select
                    value={abcC}
                    onChange={(e) => setAbcC(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {SERVICE_LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={updateMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {updateMut.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save Settings
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">Settings saved successfully.</span>
              )}
              {updateMut.isError && (
                <span className="text-sm text-destructive font-medium">Failed to save settings.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
