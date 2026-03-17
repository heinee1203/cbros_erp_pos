"use client";

import { useState } from "react";
import { useAuth } from "@/app/auth-context";
import { ModalShell } from "./modal-shell";

export function TransferModal({ onClose }: { onClose: () => void }) {
  const { locations, locationId } = useAuth();
  const currentLoc = locations.find((l) => l.id === locationId);
  const otherLocations = locations.filter((l) => l.id !== locationId);
  const [destination, setDestination] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const isValid = destination.trim() !== "" && Number(quantity) >= 1;
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!isValid) return; onClose(); };

  return (
    <ModalShell title="Transfer Stock" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Source Location</label>
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{currentLoc?.name ?? "Current Location"}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Destination Location <span className="text-destructive">*</span></label>
          <select value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" required>
            <option value="">Select destination...</option>
            {otherLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Quantity <span className="text-destructive">*</span></label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity to transfer" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional transfer notes..." rows={2} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={!isValid} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">Confirm Transfer</button>
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}
