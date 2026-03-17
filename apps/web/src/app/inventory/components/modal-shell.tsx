"use client";

import { X } from "lucide-react";

export function ModalShell({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-[3px]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-border bg-background p-6 shadow-2xl animate-in zoom-in-95 duration-150`} onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">{title}</h3>
            {onClose && <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close modal"><X size={16} /></button>}
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
