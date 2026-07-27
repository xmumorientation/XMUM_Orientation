"use client";

import { useMemo, useState } from "react";

import { PuzzleBoard } from "@/components/PuzzleBoard";
import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useConfig, puzzleImageUrl } from "@/components/useConfig";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";
import { friendlyError } from "@/lib/utils";

// Admin uploads ONE picture per projector location; the app slices it
// into the 5 puzzle pieces Freshies collect. Swap pictures per year —
// no code changes needed.
export default function AdminPuzzlesPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyLoc, setBusyLoc] = useState<ProjectorLocation | null>(null);

  async function upload(loc: ProjectorLocation, file: File) {
    setBusyLoc(loc);
    setError(null);
    const path = `${loc}-${Date.now()}.${file.name.split(".").pop() || "jpg"}`;
    const { error: upErr } = await supabase.storage
      .from("puzzle-images")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (upErr) {
      setError(upErr.message);
      setBusyLoc(null);
      return;
    }
    const { data } = supabase.storage.from("puzzle-images").getPublicUrl(path);
    const { error: cfgErr } = await supabase.rpc("fn_set_config", {
      p_key: `puzzle_image_${loc}`,
      p_value: data.publicUrl,
    });
    if (cfgErr) setError(friendlyError(cfgErr));
    else {
      setNotice(`${PROJECTOR_LABELS[loc]} picture updated.`);
      setTimeout(() => setNotice(null), 2500);
    }
    setBusyLoc(null);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Puzzle pictures"
        subtitle="One picture per location, sliced into 5 pieces on Freshie screens"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {PROJECTOR_LOCATIONS.map((loc) => {
        const url = puzzleImageUrl(config, loc);
        return (
          <Card key={loc} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{PROJECTOR_LABELS[loc]}</h2>
              <label className="btn-secondary cursor-pointer text-sm">
                {busyLoc === loc ? "Uploading…" : url ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busyLoc !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(loc, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {url ? (
              <>
                <p className="text-xs text-ink-faint">
                  Preview — how a group with pieces 1, 3 and 4 sees it:
                </p>
                <PuzzleBoard
                  ownedIndices={[1, 3, 4]}
                  imageUrl={url}
                  complete={false}
                />
              </>
            ) : (
              <p className="text-sm text-ink-faint">
                No picture yet — pieces show a placeholder icon until you
                upload one. Landscape images (~5:3) look best.
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
