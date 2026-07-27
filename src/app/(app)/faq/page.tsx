"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, EmptyState, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FaqItem } from "@/lib/types";

// FAQ + contacts.
export default function FaqPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("faq_items")
        .select("*")
        .order("category")
        .order("sort_order")
        .order("id");
      if (active) {
        setItems((data as FaqItem[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <div className="space-y-4">
      <PageTitle title="FAQ & contacts" subtitle="Stuck? Start here" />
      {items.length === 0 ? (
        <EmptyState message="FAQs will appear here soon." />
      ) : (
        categories.map((cat) => (
          <section key={cat}>
            <h2 className="mb-2 font-semibold">{cat}</h2>
            <Card className="divide-y divide-paper-200 p-0">
              {items
                .filter((i) => i.category === cat)
                .map((i) => (
                  <button
                    key={i.id}
                    onClick={() => setOpen(open === i.id ? null : i.id)}
                    className="block w-full px-4 py-3 text-left"
                  >
                    <p className="flex items-center justify-between text-sm font-medium">
                      {i.question}
                      <span className="text-ink-faint">
                        {open === i.id ? "−" : "+"}
                      </span>
                    </p>
                    {open === i.id && (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-soft">
                        {i.answer}
                      </p>
                    )}
                  </button>
                ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
