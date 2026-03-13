import { useCallback, useEffect, useRef, useState } from "react";

interface UseBufferedLogStateOptions {
  maxLines: number;
  flushMs?: number;
}

export function useBufferedLogState(options: UseBufferedLogStateOptions) {
  const { maxLines, flushMs = 180 } = options;
  const [lines, setLines] = useState<string[]>([]);
  const bufferRef = useRef<string[]>([]);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!bufferRef.current.length) return;
    const chunk = bufferRef.current.splice(0, bufferRef.current.length);
    setLines((prev) => {
      const merged = [...prev, ...chunk];
      return merged.length > maxLines ? merged.slice(-maxLines) : merged;
    });
  }, [maxLines]);

  const append = useCallback(
    (line: string) => {
      const next = String(line || "");
      if (!next) return;
      bufferRef.current.push(next);
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(() => {
        flush();
      }, flushMs);
    },
    [flush, flushMs]
  );

  const reset = useCallback((nextLines?: string[]) => {
    bufferRef.current = [];
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLines(Array.isArray(nextLines) ? nextLines : []);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    lines,
    setLines,
    append,
    flush,
    reset,
  };
}
