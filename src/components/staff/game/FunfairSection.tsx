"use client";

import { ExternalLink } from "lucide-react";

import { funfairPreviewHref, toggleKey, useFunfairZones } from "@/components/useFunfairZones";
import { PROJECTOR_LABELS, PROJECTOR_LOCATIONS } from "@/lib/types";

import { StatusLine } from "./parts";

// Admin → Live control's Funfair card for HOGM (FunfairZones): which
// lightbulbs (keys) power each funfair zone on the 3D map, any or all of them,
// and an override that forces a zone on or off. Same calls as Admin
// (fn_set_funfair_zone, is_game_lead(), migration 0088).

const OVERRIDES = [
  { value: null, label: "Auto", tone: "ok" },
  { value: true, label: "On", tone: "warn" },
  { value: false, label: "Off", tone: "off" },
] as const;

export function FunfairSection() {
  const { rows, missing, error, busy, save, isOn } = useFunfairZones();

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
      <StatusLine error={error} notice={null} />
      {!rows && <p className="gc-muted">Loading…</p>}
      <div className="gc-grid3">
        {rows?.map((row) => {
          const on = isOn(row);
          return (
            <article key={row.zone} className="gc-card gc-form">
              <header className="gc-game-head">
                <h3 className="gc-h4">{row.name}</h3>
                <span className="gc-chip" data-tone={on ? "live" : "off"}>
                  {on ? "ON" : "OFF"}
                </span>
              </header>
              <div className="gc-field">
                <span>Keys (lightbulbs)</span>
                <div className="gc-seg" role="group" aria-label={`${row.name} keys`}>
                  {PROJECTOR_LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      aria-pressed={row.required.includes(loc)}
                      disabled={busy}
                      onClick={() => save(toggleKey(row, loc))}
                    >
                      {PROJECTOR_LABELS[loc]}
                    </button>
                  ))}
                </div>
              </div>
              {row.required.length > 1 && (
                <div className="gc-field">
                  <span>Powers up when</span>
                  <div className="gc-seg" role="group" aria-label={`${row.name} rule`}>
                    {(["any", "all"] as const).map((rule) => (
                      <button
                        key={rule}
                        type="button"
                        aria-pressed={row.rule === rule}
                        disabled={busy}
                        onClick={() => row.rule !== rule && save({ ...row, rule })}
                      >
                        {rule === "any" ? "Any key is lit" : "All keys are lit"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="gc-field">
                <span>Override</span>
                <div className="gc-seg gc-seg-status" role="group" aria-label={`${row.name} override`}>
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
              <a className="gc-btn" href={funfairPreviewHref(row.zone)} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden /> Preview on the map
              </a>
            </article>
          );
        })}
      </div>
      <p className="gc-muted">
        Auto: the zone is on when its keys are lit. Preview plays the zone&apos;s power-up on your screen only.
      </p>
    </div>
  );
}
