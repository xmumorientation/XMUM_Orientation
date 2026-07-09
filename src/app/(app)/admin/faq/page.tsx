"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FaqItem } from "@/lib/types";

// Admin editor for /faq (questions + contacts).
export default function AdminFaqPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [form, setForm] = useState({
    category: "General",
    question: "",
    answer: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("faq_items")
      .select("*")
      .order("category")
      .order("sort_order")
      .order("id");
    setItems((data as FaqItem[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("faq_items").insert({
      ...form,
      sort_order: items.filter((i) => i.category === form.category).length,
    });
    if (error) setError(error.message);
    else {
      setForm({ ...form, question: "", answer: "" });
      setNotice("Added.");
      setTimeout(() => setNotice(null), 1500);
      load();
    }
  }

  async function remove(id: number) {
    const { error } = await supabase.from("faq_items").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div className="space-y-4">
      <PageTitle title="FAQ editor" subtitle="What Freshies see on /faq" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card>
        <form onSubmit={add} className="space-y-2">
          <input
            className="input text-sm"
            placeholder='Category, e.g. "General" / "Contacts"'
            required
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            className="input text-sm"
            placeholder="Question (or contact name)"
            required
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
          />
          <textarea
            className="input min-h-[80px] py-2 text-sm"
            placeholder="Answer (or phone number / role)"
            required
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
          />
          <button type="submit" className="btn-primary w-full">
            + Add
          </button>
        </form>
      </Card>

      <Card className="divide-y divide-base-200 p-0">
        {items.map((i) => (
          <div key={i.id} className="flex items-start gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-star-cyan">{i.category}</p>
              <p className="text-sm font-medium">{i.question}</p>
              <p className="text-xs text-ink-faint">{i.answer}</p>
            </div>
            <button
              onClick={() => remove(i.id)}
              className="text-sm text-red-500"
              aria-label={`Delete ${i.question}`}
            >
              ✕
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-faint">
            No entries yet.
          </p>
        )}
      </Card>
    </div>
  );
}
