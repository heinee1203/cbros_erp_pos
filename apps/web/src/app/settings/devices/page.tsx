"use client";

import { useState, useEffect, useCallback } from "react";
import { Tablet, Edit, Power, PowerOff } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

interface PosDevice {
  id: string;
  name: string;
  deviceId: string;
  locationId: string;
  locationName: string;
  status: string;
  lastSeenAt: string | null;
  appVersion: string | null;
  registeredAt: string;
  registeredByName: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function PosDevicesPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchDevices = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PosDevice[] }>("/devices", { token, locationId });
      setDevices(res.data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading) fetchDevices();
  }, [authLoading, fetchDevices]);

  const handleUpdate = async (id: string, updates: Record<string, any>) => {
    await apiFetch(`/devices/${id}`, { token: token!, locationId: locationId!, method: "PATCH", body: updates });
    fetchDevices();
  };

  const handleDeactivate = async (id: string) => {
    await apiFetch(`/devices/${id}`, { token: token!, locationId: locationId!, method: "DELETE" });
    fetchDevices();
  };

  const saveEdit = async () => {
    if (!editId || !editName.trim()) return;
    await handleUpdate(editId, { name: editName.trim() });
    setEditId(null);
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading devices…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">POS Devices</h2>
        <p className="text-sm text-muted-foreground">Manage tablet devices bound to stores</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Device Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Store</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last Seen</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">App Version</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Registered By</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  <Tablet className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                  No POS devices registered yet. Devices will appear here when tablets are set up.
                </td>
              </tr>
            ) : devices.map((d, i) => (
              <tr key={d.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                <td className="px-3 py-2">
                  {editId === d.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        className="rounded border border-border bg-background px-2 py-0.5 text-sm"
                        autoFocus
                      />
                      <button onClick={saveEdit} className="text-xs text-primary">Save</button>
                      <button onClick={() => setEditId(null)} className="text-xs text-muted-foreground">Cancel</button>
                    </div>
                  ) : (
                    <span className="font-medium">{d.name}</span>
                  )}
                  <div className="text-[10px] font-mono text-muted-foreground">{d.deviceId}</div>
                </td>
                <td className="px-3 py-2 text-sm">{d.locationName}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    d.status === "ACTIVATED" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                  }`}>
                    {d.status === "ACTIVATED" ? <Power className="h-2.5 w-2.5" /> : <PowerOff className="h-2.5 w-2.5" />}
                    {d.status === "ACTIVATED" ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{timeAgo(d.lastSeenAt)}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{d.appVersion ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{d.registeredByName ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setEditId(d.id); setEditName(d.name); }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    {d.status === "ACTIVATED" ? (
                      <button
                        onClick={() => handleDeactivate(d.id)}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdate(d.id, { status: "ACTIVATED" })}
                        className="text-xs font-medium text-success hover:underline"
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 rounded-b-lg">
        <span className="text-[10px] text-muted-foreground">
          {devices.length} device{devices.length !== 1 ? "s" : ""} registered
        </span>
        <button onClick={fetchDevices} className="text-[10px] font-medium text-primary hover:underline">
          Refresh
        </button>
      </div>
    </div>
  );
}
