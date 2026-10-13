"use client";

import { Copy, Nfc, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LABELS, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";

import { StatusLine, useStatus } from "./parts";

// Admin → NFC for HOGM: one-time signed links for the physical stickers.
// Same API as Admin (/api/admin/nfc allows Admin and HOGM).

type TokenRow = { id: number; location: ProjectorLocation; label: string; used_at: string | null; used_by_group: number | null };

export function NfcSection() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { error, setError, notice, flash } = useStatus();
  const [location, setLocation] = useState<ProjectorLocation>("B1");
  const [count, setCount] = useState(3);
  const [minted, setMinted] = useState<{ label: string; url: string }[]>([]);
  const [issued, setIssued] = useState<TokenRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("nfc_tokens")
      .select("id, location, label, used_at, used_by_group")
      .order("id", { ascending: false });
    setIssued((data as TokenRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function mint() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/nfc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, count }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Not generated.");
      else {
        setMinted(data.tokens);
        flash(`${data.tokens.length} links ready`);
        load();
      }
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copied`);
    } catch {
      setError("Copy failed. Select the link and copy it.");
    }
  }

  const used = issued.filter((t) => t.used_at).length;

  return (
    <div className="gc-stack">
      <section className="gc-card gc-nfc" aria-labelledby="gc-nfc-new">
        <h3 id="gc-nfc-new" className="gc-eyebrow">New stickers</h3>
        <div className="gc-seg" role="group" aria-label="Location">
          {PROJECTOR_LOCATIONS.map((loc) => (
            <button key={loc} type="button" aria-pressed={location === loc} onClick={() => setLocation(loc)}>
              {PROJECTOR_LABELS[loc]}
            </button>
          ))}
        </div>
        <div className="gc-start">
          <label className="gc-length">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              className="gc-input"
              aria-label="How many stickers"
              value={count}
              onChange={(e) => setCount(Math.min(20, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))}
            />
            <span>stickers</span>
          </label>
          <button type="button" className="gc-btn gc-btn-primary gc-grow" disabled={busy} onClick={mint}>
            <Nfc size={16} aria-hidden /> Generate
          </button>
        </div>
      </section>
      <StatusLine error={error} notice={notice} />

      {minted.length > 0 && (
        <section className="gc-card gc-minted" aria-labelledby="gc-nfc-minted">
          <header className="gc-game-head">
            <h3 id="gc-nfc-minted" className="gc-eyebrow">Just generated</h3>
            <button type="button" className="gc-link" onClick={() => copy(minted.map((t) => `${t.label}\t${t.url}`).join("\n"), "All links")}>
              Copy all
            </button>
          </header>
          <p className="gc-warn">
            <TriangleAlert size={15} aria-hidden /> Shown once. Write each link to its sticker now.
          </p>
          <ul className="gc-list">
            {minted.map((t) => (
              <li key={t.label} className="gc-minted-row">
                <span>
                  <b>{t.label}</b>
                  <code>{t.url}</code>
                </span>
                <button type="button" className="gc-icon" aria-label={`Copy ${t.label}`} onClick={() => copy(t.url, t.label)}>
                  <Copy size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="gc-card" aria-labelledby="gc-nfc-issued">
        <header className="gc-game-head gc-pad">
          <h3 id="gc-nfc-issued" className="gc-eyebrow">Issued</h3>
          <span className="gc-muted">{used} / {issued.length} used</span>
        </header>
        <ul className="gc-rows">
          {issued.map((t) => (
            <li key={t.id}>
              <span>{t.label}</span>
              <span className="gc-chip" data-tone={t.used_at ? "off" : "ok"}>
                {t.used_at ? `USED · G${t.used_by_group}` : "UNUSED"}
              </span>
            </li>
          ))}
          {issued.length === 0 && <li className="gc-empty">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
