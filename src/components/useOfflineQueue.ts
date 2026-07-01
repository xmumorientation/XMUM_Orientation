"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";

export interface QueuedCall {
  id: string;
  fn: string;
  args: Record<string, unknown>;
  label: string;
  queuedAt: number;
}

const STORAGE_KEY = "gm-offline-queue-v1";

function readQueue(): QueuedCall[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedCall[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
}

// NFR-6: GM submissions queue locally and retry on reconnect. Safe because
// every mutation carries an idempotency key — a retry after an ambiguous
// network failure applies exactly once (FR-5.7).
export function useOfflineQueue() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [queue, setQueue] = useState<QueuedCall[]>([]);

  useEffect(() => {
    setQueue(readQueue());
  }, []);

  const flush = useCallback(async () => {
    let q = readQueue();
    for (const call of [...q]) {
      const { error } = await supabase.rpc(call.fn, call.args);
      // Business-rule rejections (permission, balance…) won't succeed on
      // retry — drop them. Network errors keep the item queued.
      const isNetworkError =
        error && /fetch|network|timeout|connection/i.test(error.message ?? "");
      if (!error || !isNetworkError) {
        q = q.filter((c) => c.id !== call.id);
        writeQueue(q);
      } else {
        break; // still offline; stop hammering
      }
    }
    setQueue(q);
  }, [supabase]);

  useEffect(() => {
    window.addEventListener("online", flush);
    const interval = setInterval(() => {
      if (readQueue().length > 0 && navigator.onLine) flush();
    }, 15_000);
    return () => {
      window.removeEventListener("online", flush);
      clearInterval(interval);
    };
  }, [flush]);

  // Attempts the call immediately; on network failure, queues it.
  // Returns { status: 'confirmed' | 'queued' | 'rejected', error? }
  const submit = useCallback(
    async (
      fn: string,
      args: Record<string, unknown>,
      label: string
    ): Promise<{
      status: "confirmed" | "queued" | "rejected";
      error?: string;
      data?: unknown;
    }> => {
      try {
        const { data, error } = await supabase.rpc(fn, args);
        if (!error) return { status: "confirmed", data };
        if (/fetch|network|timeout|connection/i.test(error.message ?? "")) {
          const q = readQueue();
          q.push({
            id: crypto.randomUUID(),
            fn,
            args,
            label,
            queuedAt: Date.now(),
          });
          writeQueue(q);
          setQueue(q);
          return { status: "queued" };
        }
        return { status: "rejected", error: error.message };
      } catch {
        const q = readQueue();
        q.push({
          id: crypto.randomUUID(),
          fn,
          args,
          label,
          queuedAt: Date.now(),
        });
        writeQueue(q);
        setQueue(q);
        return { status: "queued" };
      }
    },
    [supabase]
  );

  return { queue, submit, flush };
}
