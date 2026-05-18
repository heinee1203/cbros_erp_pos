"use client";

import { Loader2 } from "lucide-react";

import type { BackorderItem } from "../types";
import { ModalOverlay } from "./modal-overlay";

interface EditBackorderModalProps {
  item: BackorderItem;
  priority: string;
  neededBy: string;
  notes: string;
  loading: boolean;
  onPriorityChange: (value: string) => void;
  onNeededByChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function EditBackorderModal({
  item,
  priority,
  neededBy,
  notes,
  loading,
  onPriorityChange,
  onNeededByChange,
  onNotesChange,
  onClose,
  onSave,
}: EditBackorderModalProps) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-md">
        <h3 className="text-base font-semibold text-foreground mb-1">
          Edit Backorder
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Editing backorder for{" "}
          <span className="font-medium text-foreground">
            {item.productName}
          </span>
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Needed By
            </label>
            <input
              type="date"
              value={neededBy}
              onChange={(e) => onNeededByChange(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
