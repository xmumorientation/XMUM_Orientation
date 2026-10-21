"use client";

import { useEffect, useMemo, useState } from "react";

import { PLACE_NAME_MAX, PLACE_SHORT_MAX, placeKey, type ProjectorPlace } from "@/lib/projectorPlaces";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_CODE_NAMES, PROJECTOR_LABELS, PROJECTOR_SHORT_LABELS, type ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

// Where a projector stands (game_config projector_place_<location>, 0097),
// on Admin → Puzzles and HOGM's Game control → Puzzles. Empty fields go back
// to the default place. `dark` is the Game control look.

export function ProjectorPlaceForm({
  loc,
  place,
  dark = false,
  onSaved,
  onError,
}: {
  loc: ProjectorLocation;
  place: ProjectorPlace;
  dark?: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [name, setName] = useState(place.name);
  const [short, setShort] = useState(place.short);
  const [busy, setBusy] = useState(false);
  // Follow a change saved elsewhere (useConfig is live).
  useEffect(() => setName(place.name), [place.name]);
  useEffect(() => setShort(place.short), [place.short]);
  const changed = name.trim() !== place.name || short.trim() !== place.short;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const value = { name: name.trim() || PROJECTOR_LABELS[loc], short: short.trim() || PROJECTOR_SHORT_LABELS[loc] };
    const { error } = await supabase.rpc("fn_set_config", { p_key: placeKey(loc), p_value: value });
    setBusy(false);
    if (error) onError(friendlyError(error));
    else onSaved(`${PROJECTOR_CODE_NAMES[loc]} is now at ${value.name}.`);
  }

  const input = dark ? "gc-input" : "input text-sm";
  return (
    <form onSubmit={save} className={dark ? "gc-form" : "space-y-2"}>
      <label className={dark ? "gc-field" : "block"}>
        <span className={dark ? undefined : "label"}>Place</span>
        <input
          className={input}
          value={name}
          maxLength={PLACE_NAME_MAX}
          placeholder={PROJECTOR_LABELS[loc]}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className={dark ? "gc-field" : "block"}>
        <span className={dark ? undefined : "label"}>Short name (on small cards)</span>
        <input
          className={input}
          value={short}
          maxLength={PLACE_SHORT_MAX}
          placeholder={PROJECTOR_SHORT_LABELS[loc]}
          onChange={(e) => setShort(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className={dark ? "gc-btn gc-btn-primary" : "btn-secondary px-4 text-sm"}
        disabled={busy || !changed}
      >
        {busy ? "Saving…" : "Save place"}
      </button>
    </form>
  );
}
