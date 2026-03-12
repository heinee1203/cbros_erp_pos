"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * staleTime guidelines:
 * - 10s: Detail pages that may change while user is viewing (counts, job cards)
 * - 15s: List pages the user actively works with (products, sales, POs, transfers)
 * - 30s: Reference data and dashboards (stock levels, journal, categories, families)
 * - 60s: Reports and slowly-changing lookups (service operations)
 * - 120s: Very stable reference data (location lists, employee lists)
 */

/**
 * Provides the TanStack Query client to the React tree.
 *
 * Configuration follows "Pessimistic, Reconciliation-First" architecture:
 *  - Zero optimistic UI → staleTime short, always refetch on mount
 *  - No automatic background refetching (user controls data freshness)
 *  - Retry only on network errors (not on 4xx business logic errors)
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30s — server truth is fresh for 30s
            refetchOnWindowFocus: false, // explicit refetch only
            retry: (failureCount, error) => {
              // Don't retry on 4xx business errors
              if (error instanceof ApiError && error.status < 500) {
                return false;
              }
              // Retry up to 2 times on 5xx/network
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false, // mutations never auto-retry (we handle 423 manually)
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * Custom error class that preserves HTTP status codes for
 * enterprise error handling (409/423/500 differentiation).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
