"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useConfig } from "@/components/useConfig";
import { friendlyError } from "@/lib/utils";

// Event branding lives in runtime config so every year's orientation can
// rebrand (name, tagline, accent colours) without touching code.
export default function AdminBrandPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { brand, loaded } = useConfig();
  const [form, setForm] = useState({
    event_name: "",
    event_tagline: "",
    brand_primary: "#0891b2",
    brand_secondary: "#7c3aed",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loaded) {
      setForm({
        event_name: brand.eventName,
        event_tagline: brand.eventTagline,
        brand_primary: brand.brandPrimary,
        brand_secondary: brand.brandSecondary,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    for (const [key, value] of Object.entries(form)) {
      const { error } = await supabase.rpc("fn_set_config", {
        p_key: key,
        p_value: value,
      });
      if (error) {
        setError(friendlyError(error));
        setBusy(false);
        return;
      }
    }
    setNotice("Brand updated — every open client refreshes live.");
    setTimeout(() => setNotice(null), 3000);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Event branding"
        subtitle="Rename & recolour for each year's orientation — no redeploy"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label" htmlFor="name">
              Event name
            </label>
            <input
              id="name"
              className="input"
              required
              value={form.event_name}
              onChange={(e) => setForm({ ...form, event_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="tagline">
              Tagline
            </label>
            <input
              id="tagline"
              className="input"
              value={form.event_tagline}
              onChange={(e) =>
                setForm({ ...form, event_tagline: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="c1">
                Accent colour 1
              </label>
              <input
                id="c1"
                type="color"
                className="input h-[44px] p-1"
                value={form.brand_primary}
                onChange={(e) =>
                  setForm({ ...form, brand_primary: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label" htmlFor="c2">
                Accent colour 2
              </label>
              <input
                id="c2"
                type="color"
                className="input h-[44px] p-1"
                value={form.brand_secondary}
                onChange={(e) =>
                  setForm({ ...form, brand_secondary: e.target.value })
                }
              />
            </div>
          </div>

          <div
            className="rounded-xl p-4 text-center text-white"
            style={{
              background: `linear-gradient(90deg, ${form.brand_primary}, ${form.brand_secondary})`,
            }}
          >
            <p className="text-lg font-bold">{form.event_name || "Event"}</p>
            <p className="text-sm opacity-80">{form.event_tagline}</p>
          </div>

          <button disabled={busy} type="submit" className="btn-primary w-full">
            Save branding
          </button>
        </form>
      </Card>
    </div>
  );
}
