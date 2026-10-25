"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FunfairLightGroup, type LightGroup } from "@/components/admin/FunfairLightGroup";
import { useProjectorPlaces } from "@/components/useConfig";
import { funfairPreviewHref, toggleKey, useFunfairZones } from "@/components/useFunfairZones";
import { SIGN_NOTE } from "@/lib/funfair";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LOCATIONS } from "@/lib/types";

import { StatusLine } from "./parts";

// Admin → Live control → Game master → Funfair's cards for HOGM: light a key
// for a group (FunfairLightGroup, fn_game_lead_light_projector, 0105), then
// which lightbulbs (keys) power each funfair zone on the 3D map, any or all of
// them, and an override that forces a zone on or off. Same calls as Admin
// (fn_set_funfair_zone, is_game_lead(), migration 0088). One list for the
// zones; the notes fold away.

const OVERRIDES = [
  { value: null, label: "Auto", tone: "ok" },
  { value: true, label: "On", tone: "warn" },
  { value: false, label: "Off", tone: "off" },
] as const;

export function FunfairSection() {
  const places = useProjectorPlaces();
  const { rows, missing, error, busy, save, isOn } = useFunfairZones();
  const supabase = useMemo(() => supabaseBrowser(), []);
  // A GM-tier page cannot read the groups table; fn_scoreboard() gives id, name and colour.
  const [groups, setGroups] = useState<LightGroup[]>([]);
  const [gid, setGid] = useState<number | null>(null);
  const [lightError, setLightError] = useState<string | null>(null);
  const [lightNotice, setLightNotice] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc("fn_scoreboard").then(({ data }) => {
      const gs = ((data ?? []) as LightGroup[]).map((g) => ({ id: g.id, name: g.name, color: g.color })).sort((a, b) => a.id - b.id);
      setGroups(gs);
      setGid((cur) => cur ?? gs[0]?.id ?? null);
    });
  }, [supabase]);
  // The finale (the lake stage's concert) plays while all three zones are on.
  const finale = rows?.length ? rows.every(isOn) : null;

  if (missing) {
    return (
      <div className="gc-stack">
        <p className="gc-card gc-empty">
          The funfair setup needs migration 0088. Until then each zone powers up with its default key: West with A3,
          Central with Track &amp; Field, East with B1.
        </p>
      </div>
    );
  }

  return (
    <div className="gc-stack">
      <StatusLine error={error ?? lightError} notice={lightNotice} />
      <article className="gc-card gc-ff-card">
        <FunfairLightGroup
          groups={groups}
          groupId={gid}
          onPick={setGid}
          canReplace={false}
          onError={setLightError}
          onNotice={(m) => {
            setLightNotice(m);
            setTimeout(() => setLightNotice(null), 3000);
          }}
        />
      </article>

      <article className="gc-card gc-ff-list">
        <header className="gc-ff-head">
          <h3 className="gc-h4">Zones</h3>
          <span className="gc-muted">Which keys power each zone of the 3D map</span>
        </header>
        {!rows && <p className="gc-muted gc-ff-pad">Loading…</p>}
        {rows?.map((row) => {
          const on = isOn(row);
          return (
            <div key={row.zone} className="gc-ff-row">
              <div className="gc-ff-name">
                <h4>{row.name}</h4>
                <span className="gc-chip" data-tone={on ? "live" : "off"}>
                  {on ? "ON" : "OFF"}
                </span>
              </div>
              <div className="gc-ff-ctl">
                <div className="gc-field">
                  <span>Keys</span>
                  <div className="gc-seg gc-seg-sm" role="group" aria-label={`${row.name} keys`}>
                    {PROJECTOR_LOCATIONS.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        title={places[loc].name}
                        aria-label={places[loc].name}
                        aria-pressed={row.required.includes(loc)}
                        disabled={busy}
                        onClick={() => save(toggleKey(row, loc))}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
                {row.required.length > 1 && (
                  <div className="gc-field">
                    <span>On when</span>
                    <div className="gc-seg gc-seg-sm" role="group" aria-label={`${row.name} rule`}>
                      {(["any", "all"] as const).map((rule) => (
                        <button
                          key={rule}
                          type="button"
                          aria-pressed={row.rule === rule}
                          disabled={busy}
                          onClick={() => row.rule !== rule && save({ ...row, rule })}
                        >
                          {rule === "any" ? "Any lit" : "All lit"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="gc-field">
                  <span>Override</span>
                  <div className="gc-seg gc-seg-sm gc-seg-status" role="group" aria-label={`${row.name} override`}>
                    {OVERRIDES.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        aria-pressed={row.manual === o.value}
                        data-tone={o.tone}
                        disabled={busy}
                        onClick={() => row.manual !== o.value && save({ ...row, manual: o.value })}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <a
                className="gc-ff-icon"
                href={funfairPreviewHref(row.zone)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Preview ${row.name} on the map`}
                title="Preview on the map"
              >
                <ExternalLink size={16} aria-hidden />
              </a>
            </div>
          );
        })}
        <div className="gc-ff-row gc-ff-finale">
          <div className="gc-ff-name">
            <h4>Finale · Lake stage concert</h4>
            {finale !== null && (
              <span className="gc-chip" data-tone={finale ? "live" : "off"}>
                {finale ? "LIVE" : "OFF"}
              </span>
            )}
          </div>
          <p className="gc-muted">Plays while all three zones are on. To start it early, set all three overrides to On.</p>
          <a
            className="gc-ff-icon"
            href={funfairPreviewHref("lakefront")}
            target="_blank"
            rel="noreferrer"
            aria-label="Preview the concert on the map"
            title="Preview on the map"
          >
            <ExternalLink size={16} aria-hidden />
          </a>
        </div>
      </article>

      <details className="gc-ff-notes">
        <summary>How this works</summary>
        <p className="gc-muted">
          Auto: a zone is on when its keys are lit. A change shows on every map within about 10 s. Preview plays the
          zone&apos;s power-up (or the concert&apos;s opening) on your screen only.
        </p>
        <p className="gc-muted">{SIGN_NOTE}</p>
      </details>
    </div>
  );
}
