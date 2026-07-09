"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Toast {
  id: number;
  name: string;
}

// FR-6.3: "new item acquired" pop-up on Freshie clients within 5s of grant.
export function NewItemToast() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!profile.group_id) return;

    const channel = supabase
      .channel(`inventory-toast-${profile.group_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inventory",
          filter: `group_id=eq.${profile.group_id}`,
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
            name: data?.name ?? "New item",
          };
          setToasts((t) => [...t, toast]);
          setTimeout(
            () => setToasts((t) => t.filter((x) => x.id !== toast.id)),
            5000
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.group_id]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card animate-floatup flex items-center gap-2 px-4 py-2 shadow-glow"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[10px] font-black text-white">
            NEW
          </span>
          <span className="text-sm font-semibold">
            New item acquired: {t.name}
          </span>
        </div>
      ))}
    </div>
  );
}
