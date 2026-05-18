"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { CountLineRow } from "@/hooks/use-inventory-counts";

type UseCountLineEditorArgs = {
  line: CountLineRow;
  onRecord: (lineId: string, qty: number) => void;
};

export function useCountLineEditor({
  line,
  onRecord,
}: UseCountLineEditorArgs) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(
    line.countedQty !== null ? String(line.countedQty) : "",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) {
      setInputVal(line.countedQty !== null ? String(line.countedQty) : "");
    }
  }, [line.countedQty, editing]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setInputVal(line.countedQty !== null ? String(line.countedQty) : "");
  }, [line.countedQty]);

  const submitCount = useCallback(() => {
    const val = parseInt(inputVal, 10);
    if (!isNaN(val) && val >= 0) {
      onRecord(line.id, val);
    }
    setEditing(false);
  }, [inputVal, line.id, onRecord]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        submitCount();
      } else if (event.key === "Escape") {
        cancelEditing();
      } else if (event.key === "Tab") {
        submitCount();
      }
    },
    [cancelEditing, submitCount],
  );

  return {
    editing,
    inputRef,
    inputVal,
    handleKeyDown,
    setEditing,
    setInputVal,
    submitCount,
  };
}
