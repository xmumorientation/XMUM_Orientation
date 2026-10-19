"use client";

import { ImageUp } from "lucide-react";
import { useMemo, useState } from "react";

import { PuzzleBoard } from "@/components/PuzzleBoard";
import { puzzleImageUrl, useConfig } from "@/components/useConfig";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LABELS, PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

import { StatusLine, useStatus } from "./parts";

// Admin → Puzzles for HOGM: one picture per location, sliced into 5 pieces
// on Freshie screens. Same upload as Admin (storage puzzle-images, then the
// puzzle_image_<location> config key).

export function PuzzlesSection() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const { error, setError, notice, flash } = useStatus();
  const [busyLoc, setBusyLoc] = useState<ProjectorLocation | null>(null);

  async function upload(loc: ProjectorLocation, file: File) {
    setBusyLoc(loc);
    const path = `${loc}-${Date.now()}.${file.name.split(".").pop() || "jpg"}`;
    const { error: upErr } = await supabase.storage
      .from("puzzle-images")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (upErr) {
      setBusyLoc(null);
      return setError(friendlyError(upErr));
    }
    const { data } = supabase.storage.from("puzzle-images").getPublicUrl(path);
    const { error: cfgErr } = await supabase.rpc("fn_set_config", {
      p_key: `puzzle_image_${loc}`,
      p_value: data.publicUrl,
    });
    setBusyLoc(null);
    if (cfgErr) setError(friendlyError(cfgErr));
    else flash(`${PROJECTOR_LABELS[loc]} updated`);
  }

  return (
    <div className="gc-stack">
      <StatusLine error={error} notice={notice} />
      <div className="gc-grid3">
        {PROJECTOR_LOCATIONS.map((loc) => {
          const url = puzzleImageUrl(config, loc);
          return (
            <article key={loc} className="gc-card gc-puzzle">
              <header className="gc-game-head">
                <h3 className="gc-h4">{PROJECTOR_LABELS[loc]}</h3>
                <span className="gc-chip" data-tone={url ? "ok" : "off"}>{url ? "SET" : "EMPTY"}</span>
              </header>
              {url ? (
                <PuzzleBoard ownedIndices={[0, 1, 2, 3, 4]} imageUrl={url} complete={false} />
              ) : (
                <div className="gc-puzzle-empty">Landscape, about 5:3</div>
              )}
              <label className="gc-btn gc-upload">
                <ImageUp size={16} aria-hidden />
                {busyLoc === loc ? "Uploading…" : url ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="gc-sr"
                  disabled={busyLoc !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(loc, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </article>
          );
        })}
      </div>
    </div>
  );
}
