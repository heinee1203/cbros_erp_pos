"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/query-provider";

// ── Shared mutation status ──

export type SaleMutationStatus =
  | "idle"
  | "submitting"
  | "success"
  | "already_processed"
  | "contention_retry"
  | "needs_reconcile"
  | "error";

function getStatusMessage(
  status: SaleMutationStatus,
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

// ── Types ──

export interface CartLine {
  productId: string;
  quantity: number;
  overridePrice?: string;
  discountAmount?: string;
  notes?: string;
}

export interface CreateSaleRequest {
  locationId: string;
  customerId?: string;
  customerVehicleId?: string;
  notes?: string;
  lines: CartLine[];
}

interface SaleResponse {
  sale: {
    id: string;
    saleNo: string;
    status: string;
    grandTotal: string;
    [key: string]: unknown;
  };
  lines: unknown[];
}

// ── Create Sale Mutation ──

export function useCreateSaleMutation(token: string, locationId: string) {
  const queryClient = useQueryClient();

  return useMutation<SaleResponse, ApiError, CreateSaleRequest>({
    mutationFn: (input) =>
      apiFetch<SaleResponse>("/sales", {
        method: "POST",
        body: JSON.stringify(input),
        token,
        locationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}

// ── Generic Sale Action Mutation Factory ──

interface UseSaleMutationOptions<TInput> {
  buildPath: (saleId: string) => string;
  buildBody: (input: TInput, idempotencyKey: string) => Record<string, unknown>;
  /** Whether the mutation uses an idempotency key (default: true) */
  useIdempotencyKey?: boolean;
}

interface UseSaleMutationReturn<TInput> {
  submit: (saleId: string, input: TInput) => void;
  status: SaleMutationStatus;
  statusMessage: string | null;
  isSubmitting: boolean;
  reset: () => void;
}

function useSaleMutation<TInput>(
  token: string,
  locationId: string,
  options: UseSaleMutationOptions<TInput>,
): UseSaleMutationReturn<TInput> {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaleMutationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const pendingRef = useRef<{
    saleId: string;
    body: Record<string, unknown>;
  } | null>(null);

  const mutation = useMutation<
    unknown,
    ApiError,
    { saleId: string; body: Record<string, unknown> }
  >({
    mutationFn: async ({ saleId, body }) => {
      return apiFetch(options.buildPath(saleId), {
        method: "POST",
        body: JSON.stringify(body),
        token,
        locationId,
      });
    },
    onSuccess: () => {
      setStatus("success");
      setStatusMessage(getStatusMessage("success"));
      queryClient.invalidateQueries({ queryKey: ["sales"] });
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
        queryClient.invalidateQueries({ queryKey: ["sales"] });
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
        queryClient.invalidateQueries({ queryKey: ["sales"] });
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
    [queryClient, mutation],
  );

  const submit = useCallback(
    (saleId: string, input: TInput) => {
      const idempotencyKey = crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      retryCountRef.current = 0;

      const body =
        options.useIdempotencyKey === false
          ? options.buildBody(input, "")
          : options.buildBody(input, idempotencyKey);
      pendingRef.current = { saleId, body };

      setStatus("submitting");
      setStatusMessage(getStatusMessage("submitting"));
      mutation.mutate({ saleId, body });
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

/** Complete a sale — THE CHECKOUT PATH */
export function useCompleteSaleMutation(
  token: string,
  locationId: string,
) {
  return useSaleMutation<Record<string, never>>(token, locationId, {
    buildPath: (id) => `/sales/${id}/complete`,
    buildBody: (_, key) => ({ idempotencyKey: key }),
  });
}

/** Park an open sale */
export function useParkSaleMutation(token: string, locationId: string) {
  return useSaleMutation<Record<string, never>>(token, locationId, {
    buildPath: (id) => `/sales/${id}/park`,
    buildBody: () => ({}),
    useIdempotencyKey: false,
  });
}

/** Resume a parked sale */
export function useResumeSaleMutation(token: string, locationId: string) {
  return useSaleMutation<Record<string, never>>(token, locationId, {
    buildPath: (id) => `/sales/${id}/resume`,
    buildBody: () => ({}),
    useIdempotencyKey: false,
  });
}

/** Void a sale */
export function useVoidSaleMutation(token: string, locationId: string) {
  return useSaleMutation<{ notes?: string }>(token, locationId, {
    buildPath: (id) => `/sales/${id}/void`,
    buildBody: (input) => ({ notes: input.notes }),
    useIdempotencyKey: false,
  });
}

/** Refund a completed sale — admin/manager only */
export function useRefundSaleMutation(token: string, locationId: string) {
  return useSaleMutation<{ notes?: string }>(token, locationId, {
    buildPath: (id) => `/sales/${id}/refund`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}
