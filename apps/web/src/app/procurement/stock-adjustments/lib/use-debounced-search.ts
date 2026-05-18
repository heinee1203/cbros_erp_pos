"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useDebouncedSearch(delayMs = 300) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingDebounce = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      clearPendingDebounce();
      timeoutRef.current = setTimeout(() => {
        setDebouncedSearch(value);
      }, delayMs);
    },
    [clearPendingDebounce, delayMs],
  );

  const clearSearch = useCallback(() => {
    clearPendingDebounce();
    setSearchQuery("");
    setDebouncedSearch("");
  }, [clearPendingDebounce]);

  useEffect(() => clearPendingDebounce, [clearPendingDebounce]);

  return {
    clearSearch,
    debouncedSearch,
    handleSearchChange,
    searchQuery,
  };
}
