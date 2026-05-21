"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type RowActionsProps = {
  productId: string;
  productName: string;
  isParent?: boolean;
  onView: () => void;
  onDelete: (id: string, name: string, isParent?: boolean) => void;
};

export function RowActions({
  productId,
  productName,
  isParent,
  onView,
  onDelete,
}: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            setOpenUpward(spaceBelow < 160);
          }
          setOpen(!open);
        }}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 z-20 w-40 rounded-lg border border-border bg-background py-1 shadow-lg",
            openUpward ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent"
          >
            <Eye size={13} /> View Details
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/inventory/${productId}/edit`);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent"
          >
            <Pencil size={13} /> Edit Item
          </button>
          <div className="my-1 border-t border-border" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(productId, productName, isParent);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
