"use client";

import { ClipboardList } from "lucide-react";

interface EmptyStateProps {
  message: string;
  submessage: string;
}

export function EmptyState({ message, submessage }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <ClipboardList size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{submessage}</p>
      </div>
    </div>
  );
}
