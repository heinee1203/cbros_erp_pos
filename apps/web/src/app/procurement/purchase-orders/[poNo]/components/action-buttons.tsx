"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/auth-context";
import type { PODetail } from "@/hooks/use-po-query";
import {
  useCancelPOMutation,
  useCloseVariancePOMutation,
  useSubmitPOMutation,
} from "@/hooks/use-po-mutations";
import { Spinner } from "./shared";

export function SubmitPOButton({ po }: { po: PODetail }) {
  const { token, locationId } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const mut = useSubmitPOMutation(token, locationId, po.poNo);

  useEffect(() => {
    if (mut.status === "success" || mut.status === "already_processed") {
      const timer = setTimeout(() => {
        mut.reset();
        setConfirming(false);
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [mut.status, mut]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Submit PO
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {mut.statusMessage && (
        <span
          className={`text-xs font-medium ${
            mut.status === "success"
              ? "text-success"
              : mut.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {mut.statusMessage}
        </span>
      )}
      <button
        onClick={() => mut.submit(po.id, {})}
        disabled={mut.isSubmitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        {mut.isSubmitting ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Submitting...
          </span>
        ) : (
          "Confirm Submit"
        )}
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          mut.reset();
        }}
        disabled={mut.isSubmitting}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}

export function CancelPOButton({ po }: { po: PODetail }) {
  const { token, locationId } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");
  const mut = useCancelPOMutation(token, locationId, po.poNo);

  useEffect(() => {
    if (mut.status === "success" || mut.status === "already_processed") {
      const timer = setTimeout(() => {
        mut.reset();
        setConfirming(false);
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [mut.status, mut]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
      >
        Cancel PO
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {mut.statusMessage && (
        <span
          className={`text-xs font-medium ${
            mut.status === "success"
              ? "text-success"
              : mut.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {mut.statusMessage}
        </span>
      )}
      <input
        type="text"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Cancellation reason..."
        disabled={mut.isSubmitting}
        className="w-48 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
      />
      <button
        onClick={() =>
          mut.submit(po.id, { notes: notes.trim() || undefined })
        }
        disabled={mut.isSubmitting}
        className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-40"
      >
        {mut.isSubmitting ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Cancelling...
          </span>
        ) : (
          "Confirm Cancel"
        )}
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          mut.reset();
        }}
        disabled={mut.isSubmitting}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}

export function CloseVarianceButton({ po }: { po: PODetail }) {
  const { token, locationId } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");
  const mut = useCloseVariancePOMutation(token, locationId, po.poNo);

  useEffect(() => {
    if (mut.status === "success" || mut.status === "already_processed") {
      const timer = setTimeout(() => {
        mut.reset();
        setConfirming(false);
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [mut.status, mut]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-warning px-4 py-2 text-sm font-medium text-warning hover:bg-warning/10"
      >
        Close with Variance
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {mut.statusMessage && (
        <span
          className={`text-xs font-medium ${
            mut.status === "success"
              ? "text-success"
              : mut.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
          }`}
        >
          {mut.statusMessage}
        </span>
      )}
      <input
        type="text"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Variance notes..."
        disabled={mut.isSubmitting}
        className="w-48 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
      />
      <button
        onClick={() =>
          mut.submit(po.id, { notes: notes.trim() || undefined })
        }
        disabled={mut.isSubmitting}
        className="rounded-md bg-warning px-4 py-2 text-sm font-medium text-white hover:bg-warning/90 disabled:opacity-40"
      >
        {mut.isSubmitting ? (
          <span className="flex items-center gap-1.5">
            <Spinner /> Closing...
          </span>
        ) : (
          "Confirm Close"
        )}
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          mut.reset();
        }}
        disabled={mut.isSubmitting}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}
