"use client";

import { ExternalLink } from "lucide-react";

import { Card } from "@/components/ui";
import { useProjectorPlaces } from "@/components/useConfig";
import { funfairPreviewHref, toggleKey, useFunfairZones } from "@/components/useFunfairZones";
import { SIGN_NOTE, type FunfairZoneRow } from "@/lib/funfair";
import { PROJECTOR_LOCATIONS } from "@/lib/types";
import { cn } from "@/lib/utils";

// Admin → Game → Funfair (3D map): which lightbulbs (keys) power each zone of the 3D
// map's Vortexa Funfair, any or all of them, and an override that forces a
// zone on or off (fn_set_funfair_zone, migration 0088). HOGM has the same
// card in Game control (FunfairSection); both are game leads (is_game_lead()).

const OVERRIDES: { value: boolean | null; label: string }[] = [
  { value: null, label: "Auto" },
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

function Choice({ on, disabled, onClick, children }: { on: boolean; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn("btn min-h-[40px] px-3 text-xs", on ? "bg-ink text-white" : "border border-paper-300 bg-white")}
    >
      {children}
    </button>
  );
}

function ZoneRow({ row, on, busy, save }: { row: FunfairZoneRow; on: boolean; busy: boolean; save: (r: FunfairZoneRow) => void }) {
  const places = useProjectorPlaces();
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm font-semibold">{row.name}</p>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold",
            on ? "bg-green-100 text-green-800" : "bg-paper-200 text-ink-faint",
          )}
        >
          {on ? "ON" : "OFF"}
        </span>
        <a
          href={funfairPreviewHref(row.zone)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[40px] items-center gap-1 text-xs font-semibold underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Preview
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-xs text-ink-faint">Keys</span>
        {PROJECTOR_LOCATIONS.map((loc) => (
          <Choice key={loc} on={row.required.includes(loc)} disabled={busy} onClick={() => save(toggleKey(row, loc))}>
            {places[loc].name}
          </Choice>
        ))}
      </div>
      {row.required.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 text-xs text-ink-faint">On when</span>
          {(["any", "all"] as const).map((rule) => (
            <Choice key={rule} on={row.rule === rule} disabled={busy} onClick={() => row.rule !== rule && save({ ...row, rule })}>
              {rule === "any" ? "Any key is lit" : "All keys are lit"}
            </Choice>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-xs text-ink-faint">Override</span>
        {OVERRIDES.map((o) => (
          <Choice
            key={o.label}
            on={row.manual === o.value}
            disabled={busy}
            onClick={() => row.manual !== o.value && save({ ...row, manual: o.value })}
          >
            {o.label}
          </Choice>
        ))}
      </div>
    </div>
  );
}

/** The finale: the lake stage's concert, while all three zones are on. `live` is null while the rows load. */
function FinaleRow({ live }: { live: boolean | null }) {
  return (
    <div className="space-y-1 px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm font-semibold">Finale · Lake stage concert</p>
        {live !== null && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-bold",
              live ? "bg-rose-100 text-rose-700" : "bg-paper-200 text-ink-faint",
            )}
          >
            {live ? "LIVE" : "OFF"}
          </span>
        )}
        <a
          href={funfairPreviewHref("lakefront")}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[40px] items-center gap-1 text-xs font-semibold underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Preview
        </a>
      </div>
      <p className="text-xs text-ink-faint">
        LakeFront Café plays a concert while all three zones are on. To start it early, set all three overrides to On.
      </p>
    </div>
  );
}

export function FunfairZones() {
  const { rows, missing, error, busy, save, isOn } = useFunfairZones();

  if (missing) {
    return (
      <Card className="p-4 text-sm text-ink-faint">
        The funfair setup needs migration 0088. Until then each zone powers up with its default key: West with A3,
        Central with Track &amp; Field, East with B1.
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-paper-200 p-0">
      {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
      {!rows && <p className="px-4 py-3 text-sm text-ink-faint">Loading…</p>}
      {rows?.map((row) => (
        <ZoneRow key={row.zone} row={row} on={isOn(row)} busy={busy} save={(r) => void save(r)} />
      ))}
      <FinaleRow live={rows?.length ? rows.every(isOn) : null} />
      <p className="px-4 py-2 text-xs text-ink-faint">
        Auto: a zone is on when its keys are lit. A change shows on every map within about 10 s. Preview plays its
        power-up (or the concert&apos;s opening) on your screen only.
      </p>
      <p className="px-4 pb-3 text-xs text-ink-faint">
        {SIGN_NOTE}
      </p>
    </Card>
  );
}
