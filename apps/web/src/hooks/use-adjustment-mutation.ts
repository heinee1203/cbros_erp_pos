"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/query-provider";
import type { CreateAdjustmentInput } from "@apex/types";

// ── Types ──

/** Mutation state exposed to the UI */
export type AdjustmentMutationStatus =
  | "idle"
  | "submitting"
  | "success"
  | "already_processed"   // 409 — idempotent duplicate, not an error
  | "contention_retry"    // 423 — row locked, retrying with same key
  | "needs_reconcile"     // 5xx/timeout — unknown state, fetch truth
  | "error";              // 4xx business error (validation, role, etc.)

interface AdjustmentResult {
  journalEntry: Record<string, unknown>;
  updatedBalance: number;
  locationId: string;
  productId: string;
}

interface UseAdjustmentMutationReturn {
  /** Execute the adjustment — generates idempotencyKey internally */
  submit: (input: Omit<CreateAdjustmentInput, "idempotencyKey">) => void;
  /** Current mutation lifecycle status */
  status: AdjustmentMutationStatus;
  /** Human-readable message for the UI */
  statusMessage: string | null;
  /** True while the mutation is in-flight or retrying */
  isSubmitting: boolean;
  /** The server response on success */
  result: AdjustmentResult | null;
  /** Reset back to idle */
  reset: () => void;
}

// ── Configuration ──

const MAX_CONTENTION_RETRIES = 3;
const CONTENTION_RETRY_DELAY_MS = 1_000;

// ── Status message map ──

function getStatusMessage(status: AdjustmentMutationStatus, errorMsg?: string): string | null {
  switch (status) {
    case "idle":
      return null;
    case "submitting":
      return "Processing adjustment...";
    case "success":
      return "Adjustment recorded successfully.";
    case "already_processed":
      return "This adjustment was already processed.";
    case "contention_retry":
      return "Temporary contention — retrying automatically...";
    case "needs_reconcile":
      return "Server state unknown. Please verify the stock level.";
    case "error":
      return errorMsg ?? "An error occurred.";
  }
}

// ── Hook ──

export function useAdjustmentMutation(
  token: string,
  locationId: string,
): UseAdjustmentMutationReturn {
  const queryClient = useQueryClient();

  // Track high-level status separately from TanStack's internal state
  // because we need custom statuses (already_processed, contention_retry, etc.)
  const [status, setStatus] = useState<AdjustmentMutationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AdjustmentResult | null>(null);

  // Refs for retry logic — stable across renders
  const idempotencyKeyRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const pendingInputRef = useRef<CreateAdjustmentInput | null>(null);

  const mutation = useMutation<AdjustmentResult, ApiError, CreateAdjustmentInput>({
    mutationFn: async (input: CreateAdjustmentInput) => {
      return apiFetch<AdjustmentResult>("/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify(input),
        token,
        locationId,
      });
    },
    onSuccess: (data) => {
      setStatus("success");
      setStatusMessage(getStatusMessage("success"));
      setResult(data);

      // ── Zero Optimistic UI: invalidate and refetch server truth ──
      // Invalidate any inventory queries for this product/location
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      // Invalidate ALL stock-journal queries (Inventory History, Stock Adjustments, etc.)
      queryClient.invalidateQueries({ queryKey: ["stock-journal"] });

      // Clean up refs
      idempotencyKeyRef.current = null;
      retryCountRef.current = 0;
      pendingInputRef.current = null;
    },
    onError: (error) => {
      handleMutationError(error);
    },
  });

  /**
   * Enterprise error handling — the core of Reconciliation-First:
   *
   *  409 → Already Processed: the idempotency key was already used.
   *         This is NOT an error — the adjustment was applied. Reconcile.
   *
   *  423 → Temporary Contention: row is locked by another transaction.
   *         Retry with the SAME idempotency key (safe because idempotent).
   *
   *  5xx / network error → Unknown state. We cannot know if the server
   *         applied the adjustment or not. The user must verify manually.
   *
   *  4xx → Business logic error (validation, role, insufficient stock).
   *         Show the error message. No retry.
   */
  const handleMutationError = useCallback(
    (error: ApiError) => {
      const httpStatus = error.status;

      if (httpStatus === 409) {
        // ── 409: Already Processed ──
        // The idempotency key was used → adjustment was recorded.
        // Reconcile: invalidate queries so the UI fetches truth.
        setStatus("already_processed");
        setStatusMessage(getStatusMessage("already_processed"));
        queryClient.invalidateQueries({ queryKey: ["inventory"] });

        // Clean up
        idempotencyKeyRef.current = null;
        retryCountRef.current = 0;
        pendingInputRef.current = null;
        return;
      }

      if (httpStatus === 423) {
        // ── 423: Temporary Contention ──
        // Row locked — retry with the SAME idempotency key
        if (retryCountRef.current < MAX_CONTENTION_RETRIES && pendingInputRef.current) {
          retryCountRef.current += 1;
          setStatus("contention_retry");
          setStatusMessage(getStatusMessage("contention_retry"));

          setTimeout(() => {
            if (pendingInputRef.current) {
              mutation.mutate(pendingInputRef.current);
            }
          }, CONTENTION_RETRY_DELAY_MS);
          return;
        }

        // Exhausted retries — treat as contention error
        setStatus("error");
        setStatusMessage(
          "Row is locked by another operation. Please wait a moment and try again.",
        );
        return;
      }

      if (httpStatus >= 500 || httpStatus === 0) {
        // ── 5xx / Network Error: Unknown, Needs Reconcile ──
        setStatus("needs_reconcile");
        setStatusMessage(getStatusMessage("needs_reconcile"));
        queryClient.invalidateQueries({ queryKey: ["inventory"] });

        // Clean up key — we don't know if server processed it
        idempotencyKeyRef.current = null;
        retryCountRef.current = 0;
        pendingInputRef.current = null;
        return;
      }

      // ── 4xx: Business Error ──
      // Validation, role check, insufficient stock, etc.
      setStatus("error");
      setStatusMessage(getStatusMessage("error", error.message));

      // Clean up — the user needs to fix input and resubmit with a new key
      idempotencyKeyRef.current = null;
      retryCountRef.current = 0;
      pendingInputRef.current = null;
    },
    [queryClient, mutation],
  );

  /**
   * Submit an adjustment.
   *
   * The idempotency key is generated HERE, at the moment of final submit.
   * Not before. Not in the form state. Right here. One UUID per submit attempt.
   */
  const submit = useCallback(
    (input: Omit<CreateAdjustmentInput, "idempotencyKey">) => {
      // Generate fresh idempotency key for this submission
      const idempotencyKey = crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      retryCountRef.current = 0;

      const fullInput: CreateAdjustmentInput = {
        ...input,
        idempotencyKey,
      };

      // Persist pending intent for retry logic
      pendingInputRef.current = fullInput;

      setStatus("submitting");
      setStatusMessage(getStatusMessage("submitting"));
      setResult(null);

      mutation.mutate(fullInput);
    },
    [mutation],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setStatusMessage(null);
    setResult(null);
    idempotencyKeyRef.current = null;
    retryCountRef.current = 0;
    pendingInputRef.current = null;
    mutation.reset();
  }, [mutation]);

  return {
    submit,
    status,
    statusMessage,
    isSubmitting: status === "submitting" || status === "contention_retry",
    result,
    reset,
  };
}
