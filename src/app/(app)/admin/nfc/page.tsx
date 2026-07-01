"use client";

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

      <Card className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {PROJECTOR_LOCATIONS.map((loc) => (
            <button
              key={loc}
              onClick={() => setLocation(loc)}
              className={cn(
                "btn text-sm",
                location === loc
                  ? "bg-star-violet text-white"
                  : "border border-base-300 bg-white"
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
          🏷️ Generate {count} token{count > 1 ? "s" : ""}
        </button>
      </Card>

      {minted.length > 0 && (
        <Card className="space-y-2 border-2 border-star-goldsoft">
          <p className="text-sm font-semibold text-red-600">
            ⚠️ These full URLs are shown ONCE. Write each to its sticker now
            (NFC Tools → Write → URL record), then keep this list somewhere
            safe offline.
          </p>
          {minted.map((t) => (
            <div key={t.label} className="rounded-lg bg-base-100 p-2">
              <p className="text-xs font-bold">{t.label}</p>
              <p className="break-all font-mono text-[10px] text-ink-soft">
                {t.url}
              </p>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-0">
        <p className="border-b border-base-200 px-4 py-2 text-sm font-semibold">
          Issued tokens ({existing.length})
        </p>
        <div className="max-h-[320px] divide-y divide-base-200 overflow-y-auto">
          {existing.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <span>
                {t.label}{" "}
                <span className="text-xs text-ink-faint">({t.location})</span>
              </span>
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
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
