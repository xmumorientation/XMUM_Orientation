"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";

export interface QueuedCall {
  id: string;
  fn: string;
  args: Record<string, unknown>;
  label: string;
  queuedAt: number;
}

export interface FailedCall extends QueuedCall {
  error: string;
  failedAt: number;
}

const STORAGE_KEY = "gm-offline-queue-v1";
const FAILED_KEY = "gm-offline-failed-v1";

function readJson<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

// PostgREST errors (permission, balance, bad args…) always carry a non-empty
// `code` (SQLSTATE or PGRSTxxx). A failed fetch surfaces as an error with an
// empty code, or as a thrown TypeError. Message-sniffing is only a fallback —
// browsers word network failures differently.
function isNetworkError(error: { code?: string; message?: string }): boolean {
  if (!error.code) return true;
  return /fetch|network|timeout|connection/i.test(error.message ?? "");
}

// NFR-6: GM submissions queue locally and retry on reconnect. Safe because
// every mutation carries an idempotency key — a retry after an ambiguous
// network failure applies exactly once (FR-5.7).
export function useOfflineQueue() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [queue, setQueue] = useState<QueuedCall[]>([]);
  const [failed, setFailed] = useState<FailedCall[]>([]);
  const flushing = useRef(false);

  useEffect(() => {
    setQueue(readJson<QueuedCall>(STORAGE_KEY));
    setFailed(readJson<FailedCall>(FAILED_KEY));
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return; // online event + interval can race
    flushing.current = true;
    try {
      let q = readJson<QueuedCall>(STORAGE_KEY);
      for (const call of [...q]) {
        let error: { code?: string; message?: string } | null;
        try {
          ({ error } = await supabase.rpc(call.fn, call.args));
        } catch {
          break; // still offline; stop hammering
        }
        if (error && isNetworkError(error)) break;
        // Success, or a business-rule rejection (permission, balance…) that
        // won't succeed on retry. Either way it leaves the queue — but a
        // rejection is kept visible so the GM knows the submission was lost.
        q = q.filter((c) => c.id !== call.id);
        writeJson(STORAGE_KEY, q);
        if (error) {
          const f = readJson<FailedCall>(FAILED_KEY);
          f.push({ ...call, error: error.message ?? "Rejected", failedAt: Date.now() });
          writeJson(FAILED_KEY, f);
          setFailed(f);
        }
      }
      setQueue(q);
    } finally {
      flushing.current = false;
    }
  }, [supabase]);

  const dismissFailed = useCallback((id: string) => {
    const f = readJson<FailedCall>(FAILED_KEY).filter((c) => c.id !== id);
    writeJson(FAILED_KEY, f);
    setFailed(f);
  }, []);

  useEffect(() => {
    window.addEventListener("online", flush);
    const interval = setInterval(() => {
      if (readJson<QueuedCall>(STORAGE_KEY).length > 0 && navigator.onLine) flush();
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
      const enqueue = () => {
        const q = readJson<QueuedCall>(STORAGE_KEY);
        q.push({
          id: crypto.randomUUID(),
          fn,
          args,
          label,
          queuedAt: Date.now(),
        });
        writeJson(STORAGE_KEY, q);
        setQueue(q);
      };
      try {
        const { data, error } = await supabase.rpc(fn, args);
        if (!error) return { status: "confirmed", data };
        if (isNetworkError(error)) {
          enqueue();
          return { status: "queued" };
        }
        return { status: "rejected", error: error.message };
      } catch {
        enqueue();
        return { status: "queued" };
      }
    },
    [supabase]
  );

  return { queue, failed, dismissFailed, submit, flush };
}
