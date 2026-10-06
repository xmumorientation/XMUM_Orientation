"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterChips } from "@/components/admin/FilterChips";
import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS, type FaqItem, type UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

const emptyForm = { category: "General", question: "", answer: "", roles: [] as UserRole[] };

// Does `role` see this entry? An empty list means everyone.
const sees = (i: FaqItem, role: string) =>
  role === "all" || i.roles.length === 0 || i.roles.includes(role as UserRole);

// Admin editor for /faq (questions + contacts).
export default function AdminFaqPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [category, setCategory] = useState("all");
  const [role, setRole] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
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

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 1500);
  }

  function openAdd() {
    setEditId(null);
    setForm({ ...emptyForm, roles: role === "all" ? [] : [role as UserRole] });
    setDialogOpen(true);
  }

  function openEdit(i: FaqItem) {
    setEditId(i.id);
    setForm({ category: i.category, question: i.question, answer: i.answer, roles: i.roles });
    setDialogOpen(true);
  }

  function toggleRole(r: UserRole) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } =
      editId === null
        ? await supabase.from("faq_items").insert({
            ...form,
            sort_order: items.filter((i) => i.category === form.category).length,
          })
        : await supabase.from("faq_items").update(form).eq("id", editId);
    if (error) setError(error.message);
    else {
      setDialogOpen(false);
      flash(editId === null ? "Added." : "Saved.");
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
  const roleOptions = [
    { value: "all", label: "All roles", count: items.length },
    ...ROLES.map((r) => ({
      value: r,
      label: ROLE_LABELS[r],
      count: items.filter((i) => sees(i, r)).length,
    })),
  ];
  const inRole = items.filter((i) => sees(i, role));
  const catOptions = [
    { value: "all", label: "All", count: inRole.length },
    ...categories
      .map((c) => ({
        value: c,
        label: c,
        count: inRole.filter((i) => i.category === c).length,
      }))
      .filter((o) => o.count > 0),
  ];
  const shown = categories.filter(
    (c) => (category === "all" || category === c) && inRole.some((i) => i.category === c)
  );

  return (
    <div className="space-y-4">
      <PageTitle
        title="FAQ editor"
        subtitle="What each role sees on /faq"
        action={
          <button type="button" className="btn-primary px-5" onClick={openAdd}>
            + Add
          </button>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <FilterChips
        label="Filter by role"
        options={roleOptions}
        value={role}
        onChange={(v) => {
          setRole(v);
          setCategory("all");
        }}
      />
      {catOptions.length > 2 && (
        <FilterChips
          label="Filter by category"
          options={catOptions}
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
            {inRole
              .filter((i) => i.category === c)
              .map((i) => (
                <div key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{i.question}</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-faint">{i.answer}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {i.roles.length === 0 ? (
                        <Badge tone="neutral">Everyone</Badge>
                      ) : (
                        i.roles.map((r) => (
                          <Badge key={r} tone="info">
                            {ROLE_LABELS[r]}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openEdit(i)}
                    className="text-sm text-ink-faint hover:text-ink"
                    aria-label={`Edit ${i.question}`}
                  >
                    <Pencil size={16} strokeWidth={1.75} />
                  </button>
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
      {shown.length === 0 && (
        <Card>
          <p className="py-4 text-center text-sm text-ink-faint">No entries yet.</p>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent title={editId === null ? "Add FAQ entry" : "Edit FAQ entry"}>
          <form onSubmit={save} className="space-y-2">
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
            <fieldset>
              <legend className="mb-1 text-xs font-semibold text-ink-soft">
                Who sees it?{" "}
                <span className="font-normal text-ink-faint">
                  {form.roles.length === 0 ? "Everyone" : `${form.roles.length} role(s)`}
                </span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => {
                  const on = form.roles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleRole(r)}
                      className={cn(
                        "min-h-[32px] rounded-full px-3 text-xs font-semibold transition",
                        on
                          ? "bg-ink text-white"
                          : "border border-paper-300 bg-white text-ink-soft hover:text-ink"
                      )}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                Leave all unselected to show it to everyone. Admin always sees every entry.
              </p>
            </fieldset>
            <button type="submit" className="btn-primary w-full">
              {editId === null ? "+ Add" : "Save"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
