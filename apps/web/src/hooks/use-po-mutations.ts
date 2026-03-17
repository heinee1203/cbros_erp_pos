"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/query-provider";

// ── Shared mutation status (same pattern as transfer/sale hooks) ──

export type POMutationStatus =
  | "idle"
  | "submitting"
  | "success"
  | "already_processed"
  | "contention_retry"
  | "needs_reconcile"
  | "error";

function getStatusMessage(
  status: POMutationStatus,
  errorMsg?: string,
): string | null {
  switch (status) {
    case "idle":
      return null;
    case "submitting":
      return "Processing...";
    case "success":
      return "Operation completed successfully.";
    case "already_processed":
      return "This operation was already processed.";
    case "contention_retry":
      return "Temporary contention \u2014 retrying automatically...";
    case "needs_reconcile":
      return "Server state unknown. Please reload and verify.";
    case "error":
      return errorMsg ?? "An error occurred.";
  }
}

const MAX_CONTENTION_RETRIES = 3;
const CONTENTION_RETRY_DELAY_MS = 1_000;

// ── Generic PO Mutation Factory ──

interface UsePOMutationOptions<TInput> {
  buildPath: (poId: string) => string;
  buildBody: (input: TInput, idempotencyKey: string) => Record<string, unknown>;
}

interface UsePOMutationReturn<TInput> {
  submit: (poId: string, input: TInput) => void;
  status: POMutationStatus;
  statusMessage: string | null;
  isSubmitting: boolean;
  reset: () => void;
}

function usePOMutation<TInput>(
  token: string,
  locationId: string,
  poNo: string,
  options: UsePOMutationOptions<TInput>,
): UsePOMutationReturn<TInput> {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<POMutationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const pendingRef = useRef<{
    poId: string;
    body: Record<string, unknown>;
  } | null>(null);

  const mutation = useMutation<
    unknown,
    ApiError,
    { poId: string; body: Record<string, unknown> }
  >({
    mutationFn: async ({ poId, body }) => {
      return apiFetch(options.buildPath(poId), {
        method: "POST",
        body: JSON.stringify(body),
        token,
        locationId,
      });
    },
    onSuccess: () => {
      setStatus("success");
      setStatusMessage(getStatusMessage("success"));

      // Zero optimistic UI: invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["po", poNo] });
      queryClient.invalidateQueries({ queryKey: ["po-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      idempotencyKeyRef.current = null;
      retryCountRef.current = 0;
      pendingRef.current = null;
    },
    onError: (error) => {
      handleError(error);
    },
  });

  const handleError = useCallback(
    (error: ApiError) => {
      const httpStatus = error.status;

      if (httpStatus === 409) {
        setStatus("already_processed");
        setStatusMessage(getStatusMessage("already_processed"));
        queryClient.invalidateQueries({ queryKey: ["po", poNo] });
        idempotencyKeyRef.current = null;
        retryCountRef.current = 0;
        pendingRef.current = null;
        return;
      }

      if (httpStatus === 423) {
        if (
          retryCountRef.current < MAX_CONTENTION_RETRIES &&
          pendingRef.current
        ) {
          retryCountRef.current += 1;
          setStatus("contention_retry");
          setStatusMessage(getStatusMessage("contention_retry"));
          setTimeout(() => {
            if (pendingRef.current) {
              mutation.mutate(pendingRef.current);
            }
          }, CONTENTION_RETRY_DELAY_MS);
          return;
        }
        setStatus("error");
        setStatusMessage("Row is locked. Please wait and try again.");
        return;
      }

      if (httpStatus >= 500 || httpStatus === 0) {
        setStatus("needs_reconcile");
        setStatusMessage(getStatusMessage("needs_reconcile"));
        queryClient.invalidateQueries({ queryKey: ["po", poNo] });
        idempotencyKeyRef.current = null;
        retryCountRef.current = 0;
        pendingRef.current = null;
        return;
      }

      // 4xx business error
      setStatus("error");
      setStatusMessage(getStatusMessage("error", error.message));
      idempotencyKeyRef.current = null;
      retryCountRef.current = 0;
      pendingRef.current = null;
    },
    [queryClient, mutation, poNo],
  );

  const submit = useCallback(
    (poId: string, input: TInput) => {
      const idempotencyKey = crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      retryCountRef.current = 0;

      const body = options.buildBody(input, idempotencyKey);
      pendingRef.current = { poId, body };

      setStatus("submitting");
      setStatusMessage(getStatusMessage("submitting"));
      mutation.mutate({ poId, body });
    },
    [mutation, options],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setStatusMessage(null);
    idempotencyKeyRef.current = null;
    retryCountRef.current = 0;
    pendingRef.current = null;
    mutation.reset();
  }, [mutation]);

  return {
    submit,
    status,
    statusMessage,
    isSubmitting: status === "submitting" || status === "contention_retry",
    reset,
  };
}

// ── Concrete Mutation Hooks ──

/** Submit a DRAFT PO (DRAFT -> SUBMITTED) */
export function useSubmitPOMutation(
  token: string,
  locationId: string,
  poNo: string,
) {
  return usePOMutation<{ notes?: string }>(token, locationId, poNo, {
    buildPath: (id) => `/procurement/purchase-orders/${id}/submit`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}

/** Receive items against a PO — THE CRITICAL PATH */
export interface ReceiptLineInput {
  poLineId: string;
  receivedAcceptedQty: number;
  rejectedQty: number;
  unitCost: string;
  notes?: string;
}
export function useReceivePOMutation(
  token: string,
  locationId: string,
  poNo: string,
) {
  return usePOMutation<{
    supplierDrNo: string;
    lines: ReceiptLineInput[];
    notes?: string;
  }>(token, locationId, poNo, {
    buildPath: (id) => `/procurement/purchase-orders/${id}/receive`,
    buildBody: (input, key) => ({
      idempotencyKey: key,
      supplierDrNo: input.supplierDrNo,
      lines: input.lines,
      notes: input.notes,
    }),
  });
}

/** Close PO with variance (PARTIALLY_RECEIVED -> CLOSED_WITH_VARIANCE) */
export function useCloseVariancePOMutation(
  token: string,
  locationId: string,
  poNo: string,
) {
  return usePOMutation<{ notes?: string }>(token, locationId, poNo, {
    buildPath: (id) => `/procurement/purchase-orders/${id}/close-variance`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}

/** Cancel a PO (DRAFT/SUBMITTED -> CANCELLED) */
export function useCancelPOMutation(
  token: string,
  locationId: string,
  poNo: string,
) {
  return usePOMutation<{ notes?: string }>(token, locationId, poNo, {
    buildPath: (id) => `/procurement/purchase-orders/${id}/cancel`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}
