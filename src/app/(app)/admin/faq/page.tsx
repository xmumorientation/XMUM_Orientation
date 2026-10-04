"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterChips } from "@/components/admin/FilterChips";
import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
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
  const [category, setCategory] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
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
      setAddOpen(false);
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

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category))],
    [items]
  );
  const options = [
    { value: "all", label: "All", count: items.length },
    ...categories.map((c) => ({
      value: c,
      label: c,
      count: items.filter((i) => i.category === c).length,
    })),
  ];
  const shown = category === "all" ? categories : [category];

  return (
    <div className="space-y-4">
      <PageTitle
        title="FAQ editor"
        subtitle="What Freshies see on /faq"
        action={
          <button type="button" className="btn-primary px-5" onClick={() => setAddOpen(true)}>
            + Add
          </button>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {categories.length > 1 && (
        <FilterChips
          label="Filter by category"
          options={options}
          value={category}
          onChange={setCategory}
        />
      )}

      {shown.map((c) => (
        <section key={c}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-1">
            {c}
          </h2>
          <Card className="divide-y divide-paper-200 p-0">
            {items
              .filter((i) => i.category === c)
              .map((i) => (
                <div key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{i.question}</p>
                    <p className="text-sm text-ink-faint">{i.answer}</p>
                  </div>
                  <button
                    onClick={() => remove(i.id)}
                    className="text-sm text-red-500"
                    aria-label={`Delete ${i.question}`}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
          </Card>
        </section>
      ))}
      {items.length === 0 && (
        <Card>
          <p className="py-4 text-center text-sm text-ink-faint">No entries yet.</p>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent title="Add FAQ entry">
          <form onSubmit={add} className="space-y-2">
            <input
              className="input text-sm"
              placeholder='Category, e.g. "General" / "Contacts"'
              required
              list="faq-categories"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            <datalist id="faq-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
