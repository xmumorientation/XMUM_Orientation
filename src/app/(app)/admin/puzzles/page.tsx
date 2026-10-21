"use client";

import { useMemo, useState } from "react";

import { ProjectorPlaceForm } from "@/components/ProjectorPlaceForm";
import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useConfig, puzzleImageUrl } from "@/components/useConfig";
import { projectorPlaces } from "@/lib/projectorPlaces";
import {
  PROJECTOR_CODE_NAMES,
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";
import { friendlyError } from "@/lib/utils";

// Admin sets each projector's place (0097) and uploads ONE picture per
// projector: where its NFC card is. A group sees both once it holds all 5
// pieces of that key and taps the key on Items (0098); until then the
// projector is only its code name. Swap places and pictures per year — no
// code changes needed.
export default function AdminPuzzlesPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const places = projectorPlaces(config);
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
      flash(`${places[loc].name} picture updated.`);
    }
    setBusyLoc(null);
  }

  function flash(message: string) {
    setError(null);
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Projectors and puzzle pictures"
        subtitle="Each projector's place, and a picture of where its NFC card is. A group sees them once it has all 5 pieces and taps the key."
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {PROJECTOR_LOCATIONS.map((loc) => {
        const url = puzzleImageUrl(config, loc);
        return (
          <Card key={loc} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{PROJECTOR_CODE_NAMES[loc]} · {places[loc].name}</h2>
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
            <ProjectorPlaceForm loc={loc} place={places[loc]} onSaved={flash} onError={setError} />
            {url ? (
              <>
                <p className="text-xs text-ink-faint">
                  What a group sees when it taps the completed key:
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Where the ${PROJECTOR_CODE_NAMES[loc]} NFC card is`} className="block w-full rounded-xl" />
              </>
            ) : (
              <p className="text-sm text-ink-faint">
                No picture yet. Groups see &ldquo;Picture coming soon&rdquo; until you
                upload one. Landscape images (~5:3) look best.
              </p>
            )}
          </Card>
        );
      })}
      </div>
    </div>
  );
}
