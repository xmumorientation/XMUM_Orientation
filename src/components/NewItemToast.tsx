"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Toast {
  id: number;
  message: string;
  label: string;
}

// FR-6.3: "new item acquired" pop-up on Freshie clients within 5s of grant.
export function NewItemToast() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`targeted-toast-${profile.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inventory",
          ...(profile.group_id ? { filter: `group_id=eq.${profile.group_id}` } : {}),
        },
        async (payload) => {
          const itemId = (payload.new as { item_id: number }).item_id;
          const { data } = await supabase
            .from("items")
            .select("name")
            .eq("id", itemId)
            .single();
          const toast: Toast = {
            id: Date.now() + Math.random(),
            message: `New item acquired: ${data?.name ?? "New item"}`,
            label: "NEW",
          };
          setToasts((t) => [...t, toast]);
          setTimeout(
            () => setToasts((t) => t.filter((x) => x.id !== toast.id)),
            5000
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "token_notifications" },
        (payload) => {
          const row = payload.new as { message?: string };
          const toast: Toast = {
            id: Date.now() + Math.random(),
            message: row.message ?? "Your group's Token balance was updated.",
            label: "TOKEN",
          };
          setToasts((current) => [...current, toast]);
          setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.group_id, profile.id]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(7.5rem+env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4 lg:left-64 lg:top-5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card animate-floatup flex items-center gap-2 px-4 py-2 shadow-glow"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[10px] font-black text-white">
            {t.label}
          </span>
          <span className="text-sm font-semibold">
            {t.message}
          </span>
        </div>
      ))}
    </div>
  );
}
