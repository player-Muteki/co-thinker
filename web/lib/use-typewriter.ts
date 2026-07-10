"use client";

import { useRef, useEffect, useCallback } from "react";

/**
 * 打字机效果 Hook。
 *
 * 在 `streaming` 为 true 时开启 interval，逐字消费 buffer 并调用 onChar。
 * 当 streaming 变为 false 时停止 interval，将剩余 buffer 一次性通过 onFlush 刷出。
 */
export function useTypewriter({
  streaming,
  onChar,
  onFlush,
  intervalMs = 30,
}: {
  streaming: boolean;
  onChar: (char: string) => void;
  onFlush: (text: string) => void;
  intervalMs?: number;
}) {
  const bufferRef = useRef("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const onCharRef = useRef(onChar);
  const onFlushRef = useRef(onFlush);

  // 保持回调引用最新，避免 interval 中读到 stale closure
  onCharRef.current = onChar;
  onFlushRef.current = onFlush;

  useEffect(() => {
    if (!streaming) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // flush remaining buffer
      if (bufferRef.current) {
        onFlushRef.current(bufferRef.current);
        bufferRef.current = "";
      }
      return;
    }

    timerRef.current = setInterval(() => {
      const buf = bufferRef.current;
      if (!buf) return;
      const char = buf[0];
      bufferRef.current = buf.slice(1);
      onCharRef.current(char);
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [streaming, intervalMs]);

  const appendToBuffer = useCallback((content: string) => {
    bufferRef.current += content;
  }, []);

  return { appendToBuffer };
}
