"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/query-provider";

// ── Shared mutation status ──

export type JCMutationStatus =
  | "idle"
  | "submitting"
  | "success"
  | "already_processed"
  | "contention_retry"
  | "needs_reconcile"
  | "error";

function getStatusMessage(
  status: JCMutationStatus,
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

// ── Generic Job Card Mutation Factory ──

interface UseJCMutationOptions<TInput> {
  buildPath: (jobCardId: string) => string;
  buildBody: (input: TInput, idempotencyKey: string) => Record<string, unknown>;
  method?: string;
  /** Whether the mutation uses an idempotency key (default: true) */
  useIdempotencyKey?: boolean;
}

interface UseJCMutationReturn<TInput> {
  submit: (jobCardId: string, input: TInput) => void;
  status: JCMutationStatus;
  statusMessage: string | null;
  isSubmitting: boolean;
  reset: () => void;
}

function useJCMutation<TInput>(
  token: string,
  locationId: string,
  jobNo: string,
  options: UseJCMutationOptions<TInput>,
): UseJCMutationReturn<TInput> {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<JCMutationStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const pendingRef = useRef<{
    jobCardId: string;
    body: Record<string, unknown>;
  } | null>(null);

  const mutation = useMutation<
    unknown,
    ApiError,
    { jobCardId: string; body: Record<string, unknown> }
  >({
    mutationFn: async ({ jobCardId, body }) => {
      return apiFetch(options.buildPath(jobCardId), {
        method: options.method ?? "POST",
        body: JSON.stringify(body),
        token,
        locationId,
      });
    },
    onSuccess: () => {
      setStatus("success");
      setStatusMessage(getStatusMessage("success"));

      // Zero optimistic UI: invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["job-card", jobNo] });
      queryClient.invalidateQueries({ queryKey: ["job-card-journal"] });
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
        queryClient.invalidateQueries({ queryKey: ["job-card", jobNo] });
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
        queryClient.invalidateQueries({ queryKey: ["job-card", jobNo] });
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
    [queryClient, mutation, jobNo],
  );

  const submit = useCallback(
    (jobCardId: string, input: TInput) => {
      const idempotencyKey = crypto.randomUUID();
      idempotencyKeyRef.current = idempotencyKey;
      retryCountRef.current = 0;

      const body =
        options.useIdempotencyKey === false
          ? options.buildBody(input, "")
          : options.buildBody(input, idempotencyKey);
      pendingRef.current = { jobCardId, body };

      setStatus("submitting");
      setStatusMessage(getStatusMessage("submitting"));
      mutation.mutate({ jobCardId, body });
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

/** Transition: check-in, start-estimating, move-to-bay, start-work, complete-work, invoice, close */
export function useTransitionMutation(
  token: string,
  locationId: string,
  jobNo: string,
  action: string,
) {
  return useJCMutation<{ notes?: string }>(token, locationId, jobNo, {
    buildPath: (id) => `/job-cards/${id}/${action}`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}

/** Approve job card (triggers partial reservation) */
export function useApproveMutation(
  token: string,
  locationId: string,
  jobNo: string,
) {
  return useJCMutation<{ notes?: string }>(token, locationId, jobNo, {
    buildPath: (id) => `/job-cards/${id}/approve`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}

/** Add labor lines */
export interface LaborLineInput {
  serviceOperationId: string;
  description?: string;
  qtyHours: string;
  unitPrice: string;
}
export function useAddLaborMutation(
  token: string,
  locationId: string,
  jobNo: string,
) {
  return useJCMutation<{ lines: LaborLineInput[] }>(token, locationId, jobNo, {
    buildPath: (id) => `/job-cards/${id}/labor`,
    buildBody: (input) => ({ lines: input.lines }),
    useIdempotencyKey: false,
  });
}

/** Add part lines */
export interface PartLineInput {
  productId: string;
  locationId: string;
  plannedQty: number;
  unitPrice: string;
}
export function useAddPartsMutation(
  token: string,
  locationId: string,
  jobNo: string,
) {
  return useJCMutation<{ lines: PartLineInput[] }>(token, locationId, jobNo, {
    buildPath: (id) => `/job-cards/${id}/parts`,
    buildBody: (input) => ({ lines: input.lines }),
    useIdempotencyKey: false,
  });
}

/** Update part planned qty (scope expansion) */
export function useUpdatePartQtyMutation(
  token: string,
  locationId: string,
  jobNo: string,
) {
  return useJCMutation<{ plannedQty: number; notes?: string }>(
    token,
    locationId,
    jobNo,
    {
      buildPath: (partId) => `/job-cards/parts/${partId}/qty`,
      buildBody: (input) => ({
        plannedQty: input.plannedQty,
        notes: input.notes,
      }),
      method: "PATCH",
      useIdempotencyKey: false,
    },
  );
}

/** Issue parts (THE DEDUCTION MOMENT) */
export interface IssueLineInput {
  jobCardPartId: string;
  issueQty: number;
}
export function useIssuePartsMutation(
  token: string,
  locationId: string,
  jobNo: string,
) {
  return useJCMutation<{ lines: IssueLineInput[]; notes?: string }>(
    token,
    locationId,
    jobNo,
    {
      buildPath: (id) => `/job-cards/${id}/issue-parts`,
      buildBody: (input, key) => ({
        idempotencyKey: key,
        lines: input.lines,
        notes: input.notes,
      }),
    },
  );
}

/** Return parts */
export interface ReturnLineInput {
  jobCardPartId: string;
  returnQty: number;
}
export function useReturnPartsMutation(
  token: string,
  locationId: string,
  jobNo: string,
) {
  return useJCMutation<{ lines: ReturnLineInput[]; notes?: string }>(
    token,
    locationId,
    jobNo,
    {
      buildPath: (id) => `/job-cards/${id}/return-parts`,
      buildBody: (input, key) => ({
        idempotencyKey: key,
        lines: input.lines,
        notes: input.notes,
      }),
    },
  );
}

/** Cancel job card */
export function useCancelJobCardMutation(
  token: string,
  locationId: string,
  jobNo: string,
) {
  return useJCMutation<{ notes?: string }>(token, locationId, jobNo, {
    buildPath: (id) => `/job-cards/${id}/cancel`,
    buildBody: (input, key) => ({ idempotencyKey: key, notes: input.notes }),
  });
}
