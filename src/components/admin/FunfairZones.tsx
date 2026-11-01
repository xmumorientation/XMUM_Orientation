"use client";

import { ExternalLink } from "lucide-react";

import { useProjectorPlaces } from "@/components/useConfig";
import { funfairPreviewHref, toggleKey, useFunfairZones } from "@/components/useFunfairZones";
import { SIGN_NOTE } from "@/lib/funfair";
import { PROJECTOR_LOCATIONS } from "@/lib/types";

// Admin → Live control → Game master → Funfair: which lightbulbs (keys) power
// each zone of the 3D map's Vortexa Funfair, any or all of them, and an
// override that forces a zone on or off (fn_set_funfair_zone, migration 0088).
// HOGM has the same list in Game control (FunfairSection); both are game
// leads (is_game_lead()). One list for the zones; the notes fold away. Styled
// by game-master.css (.ffz-*).

const OVERRIDES: { value: boolean | null; label: string }[] = [
  { value: null, label: "Auto" },
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

function Seg({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ffz-field">
      <span>{label}</span>
      <div className="ffz-seg" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function FunfairZones() {
  const places = useProjectorPlaces();
  const { rows, missing, error, busy, save, isOn } = useFunfairZones();
  // The finale: the lake stage's concert, while all three zones are on.
  const finale = rows?.length ? rows.every(isOn) : null;

  if (missing) {
    return (
      <p className="gm-note">
        The funfair setup needs migration 0088. Until then each zone powers up with its default key: West with A3,
        Central with Track &amp; Field, East with B1.
      </p>
    );
  }
  return (
    <div className="ffz">
      <header className="ffz-head">
        <b>Zones</b>
        <span>Which keys power each zone of the 3D map</span>
      </header>
      {error && <p className="gm-banner" style={{ margin: "0 18px 12px" }}>{error}</p>}
      {!rows && <p className="gm-note" style={{ margin: "0 18px 14px" }}>Loading…</p>}
      {rows?.map((row) => {
        const on = isOn(row);
        return (
          <div key={row.zone} className="ffz-row">
            <div className="ffz-name">
              <h4>{row.name}</h4>
              <span className="ffz-chip" data-on={on}>{on ? "ON" : "OFF"}</span>
            </div>
            <div className="ffz-ctl">
              <Seg label="Keys">
                {PROJECTOR_LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    title={places[loc].name}
                    aria-label={places[loc].name}
                    aria-pressed={row.required.includes(loc)}
                    disabled={busy}
                    onClick={() => void save(toggleKey(row, loc))}
                  >
                    {loc}
                  </button>
                ))}
              </Seg>
              {row.required.length > 1 && (
                <Seg label="On When">
                  {(["any", "all"] as const).map((rule) => (
                    <button
                      key={rule}
                      type="button"
                      aria-pressed={row.rule === rule}
                      disabled={busy}
                      onClick={() => row.rule !== rule && void save({ ...row, rule })}
                    >
                      {rule === "any" ? "Any Lit" : "All Lit"}
                    </button>
                  ))}
                </Seg>
              )}
              <Seg label="Override">
                {OVERRIDES.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={row.manual === o.value}
                    disabled={busy}
                    onClick={() => row.manual !== o.value && void save({ ...row, manual: o.value })}
                  >
                    {o.label}
                  </button>
                ))}
              </Seg>
            </div>
            <a
              className="ffz-icon"
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
      <div className="ffz-row ffz-finale">
        <div className="ffz-name">
          <h4>Finale · Lake Stage Concert</h4>
          {finale !== null && <span className="ffz-chip" data-on={finale}>{finale ? "LIVE" : "OFF"}</span>}
        </div>
        <p>Plays while all three zones are on. To start it early, set all three overrides to On.</p>
        <a
          className="ffz-icon"
          href={funfairPreviewHref("lakefront")}
          target="_blank"
          rel="noreferrer"
          aria-label="Preview the concert on the map"
          title="Preview on the map"
        >
          <ExternalLink size={16} aria-hidden />
        </a>
      </div>
      <details className="ffz-notes">
        <summary>How This Works</summary>
        <p className="gm-note">
          Auto: a zone is on when its keys are lit. A change shows on every map within about 10 s. Preview plays the
          zone&apos;s power-up (or the concert&apos;s opening) on your screen only.
        </p>
        <p className="gm-note">{SIGN_NOTE}</p>
      </details>
    </div>
  );
}
