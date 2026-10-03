"use client";

import { TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface NfcTokenRow {
  id: number;
  location: ProjectorLocation;
  label: string;
  used_at: string | null;
  used_by_group: number | null;
  created_at: string;
}

// FR-9.1: mint signed one-time URLs for physical stickers. Write them with
// the "NFC Tools" Android app as NDEF URL records (SRS A-2).
export default function AdminNfcPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [location, setLocation] = useState<ProjectorLocation>("B1");
  const [count, setCount] = useState(3);
  const [minted, setMinted] = useState<{ label: string; url: string }[]>([]);
  const [existing, setExisting] = useState<NfcTokenRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("nfc_tokens")
      .select("id, location, label, used_at, used_by_group, created_at")
      .order("id", { ascending: false });
    setExisting((data as NfcTokenRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/nfc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, count }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed");
      else {
        setMinted(data.tokens);
        load();
      }
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="NFC activation tokens"
        subtitle="One-time signed URLs for the physical stickers"
      />
      <ErrorBanner message={error} />

      {minted.length > 0 && (
        <Card className="space-y-2 border-2 border-amber-400">
          <p className="flex items-start gap-1.5 text-sm font-semibold text-red-600">
            <TriangleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            These full URLs are shown ONCE. Write each to its sticker now
            (NFC Tools → Write → URL record), then keep this list somewhere
            safe offline.
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {minted.map((t) => (
              <div key={t.label} className="rounded-lg bg-paper-100 p-2">
                <p className="text-xs font-bold">{t.label}</p>
                <p className="break-all font-mono text-[10px] text-ink-soft">
                  {t.url}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="space-y-3">
          <h2 className="font-semibold">Generate tokens</h2>
          <div className="grid grid-cols-3 gap-2">
            {PROJECTOR_LOCATIONS.map((loc) => (
              <button
                key={loc}
                onClick={() => setLocation(loc)}
                className={cn(
                  "btn text-sm",
                  location === loc
                    ? "bg-brand-2 text-white"
                    : "border border-paper-300 bg-white"
                )}
              >
                {PROJECTOR_LABELS[loc]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="label mb-0 flex-1" htmlFor="count">
              How many stickers (incl. spares)?
            </label>
            <input
              id="count"
              type="number"
              min="1"
              max="20"
              className="input w-20"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <button disabled={busy} onClick={mint} className="btn-primary w-full">
            Generate {count} token{count > 1 ? "s" : ""}
          </button>
        </Card>

        <Card className="overflow-x-auto p-0">
          <p className="border-b border-paper-200 px-4 py-3 text-sm font-semibold">
            Issued tokens ({existing.length})
          </p>
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5">Label</th>
                <th className="w-28 px-4 py-2.5">Location</th>
                <th className="w-40 px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {existing.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-medium">{t.label}</td>
                  <td className="px-4 py-2 text-ink-soft">{t.location}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "chip",
                        t.used_at
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      )}
                    >
                      {t.used_at ? `used by G${t.used_by_group}` : "unused"}
                    </span>
                  </td>
                </tr>
              ))}
              {existing.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-ink-faint">
                    No tokens issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
