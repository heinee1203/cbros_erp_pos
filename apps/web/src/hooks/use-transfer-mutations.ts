"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/query-provider";

// ── Shared mutation status (same pattern as adjustment hook) ──

export type TransferMutationStatus =
  | "idle"
  | "submitting"
  | "success"
  | "already_processed"
  | "contention_retry"
  | "needs_reconcile"
  | "error";

function getStatusMessage(
  status: TransferMutationStatus,
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

// ── Generic Transfer Mutation Factory ──

interface UseTransferMutationOptions<TInput> {
  /** API path relative to /transfers (e.g., "/:id/approve") */
  buildPath: (transferId: string) => string;
  /** Build the request body from input + idempotencyKey */
  buildBody: (input: TInput, idempotencyKey: string) => Record<string, unknown>;
}

interface UseTransferMutationReturn<TInput> {
  submit: (transferId: string, input: TInput) => void;
  status: TransferMutationStatus;
  statusMessage: string | null;
  isSubmitting: boolean;
  reset: () => void;
}

/**
 * Factory hook for transfer mutations.
 *
 * All transfer mutations follow the same pattern:
 *  1. Generate idempotencyKey on submit
 *  2. POST to /transfers/:id/<action>
 *  3. Handle 409/423/5xx per reconciliation-first rules
 *  4. Invalidate ["transfer", ...] queries on success
 */
function useTransferMutation<TInput>(
  token: string,
  locationId: string,
  transferNo: string,
  options: UseTransferMutationOptions<TInput>,
): UseTransferMutationReturn<TInput> {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TransferMutationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const pendingRef = useRef<{ transferId: string; body: Record<string, unknown> } | null>(null);

  const mutation = useMutation<unknown, ApiError, { transferId: string; body: Record<string, unknown> }>({
    mutationFn: async ({ transferId, body }) => {
      return apiFetch(options.buildPath(transferId), {
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
      queryClient.invalidateQueries({ queryKey: ["transfer", transferNo] });
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
        queryClient.invalidateQueries({ queryKey: ["transfer", transferNo] });
        idempotencyKeyRef.current = null;
        retryCountRef.current = 0;
        pendingRef.current = null;
        return;
      }

      if (httpStatus === 423) {
        if (retryCountRef.current < MAX_CONTENTION_RETRIES && pendingRef.current) {
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
        queryClient.invalidateQueries({ queryKey: ["transfer", transferNo] });
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
    [queryClient, mutation, transferNo],
  );

  const submit = useCallback(
    (transferId: string, input: TInput) => {
      const idempotencyKey = crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      retryCountRef.current = 0;

      const body = options.buildBody(input, idempotencyKey);
      pendingRef.current = { transferId, body };

      setStatus("submitting");
      setStatusMessage(getStatusMessage("submitting"));
      mutation.mutate({ transferId, body });
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

  return { submit, status, statusMessage, isSubmitting: status === "submitting" || status === "contention_retry", reset };
}

// ── Concrete Mutation Hooks ──

/** Approve a DRAFT transfer */
export function useApproveMutation(token: string, locationId: string, transferNo: string) {
  return useTransferMutation<{ notes?: string }>(token, locationId, transferNo, {
    buildPath: (id) => `/transfers/${id}/approve`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}

/** Start picking on an APPROVED transfer */
export function useStartPickingMutation(token: string, locationId: string, transferNo: string) {
  return useTransferMutation<Record<string, never>>(token, locationId, transferNo, {
    buildPath: (id) => `/transfers/${id}/start-picking`,
    buildBody: (_, key) => ({ idempotencyKey: key }),
  });
}

/** Dispatch from source (deducts stock) */
export interface DispatchLineInput {
  transferItemId: string;
  dispatchQty: number;
}
export function useDispatchMutation(token: string, locationId: string, transferNo: string) {
  return useTransferMutation<{ lines: DispatchLineInput[]; notes?: string }>(
    token,
    locationId,
    transferNo,
    {
      buildPath: (id) => `/transfers/${id}/dispatch`,
      buildBody: (input, key) => ({
        idempotencyKey: key,
        lines: input.lines,
        notes: input.notes,
      }),
    },
  );
}

/** Receive into destination (adds stock) */
export interface ReceiveLineInput {
  transferItemId: string;
  receiveQty: number;
}
export function useReceiveMutation(token: string, locationId: string, transferNo: string) {
  return useTransferMutation<{ lines: ReceiveLineInput[]; notes?: string }>(
    token,
    locationId,
    transferNo,
    {
      buildPath: (id) => `/transfers/${id}/receive`,
      buildBody: (input, key) => ({
        idempotencyKey: key,
        lines: input.lines,
        notes: input.notes,
      }),
    },
  );
}

/** Report variance (damage/shortage write-off) */
export interface VarianceLineInput {
  transferItemId: string;
  varianceQty: number;
  reasonCode: string;
  notes?: string;
}
export function useVarianceMutation(token: string, locationId: string, transferNo: string) {
  return useTransferMutation<{ lines: VarianceLineInput[] }>(
    token,
    locationId,
    transferNo,
    {
      buildPath: (id) => `/transfers/${id}/report-variance`,
      buildBody: (input, key) => ({
        idempotencyKey: key,
        lines: input.lines,
      }),
    },
  );
}

/** Cancel a transfer */
export function useCancelMutation(token: string, locationId: string, transferNo: string) {
  return useTransferMutation<{ notes?: string }>(token, locationId, transferNo, {
    buildPath: (id) => `/transfers/${id}/cancel`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}
