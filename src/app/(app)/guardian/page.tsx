"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type Projector,
  type ProjectorLocation,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

interface PuzzleStatus {
  pieces: number;
  complete: boolean;
  redeemed: boolean;
  projector_activated: boolean;
}

// FR-8.2: Guardian GM verification flow — check group's pieces, confirm,
// mark redeemed, log the physical NFC card handover.
// FR-9.5: manual activation fallback for damaged stickers.
export default function GuardianPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [location, setLocation] = useState<ProjectorLocation>("B1");
  const [status, setStatus] = useState<PuzzleStatus | null>(null);
  const [projectors, setProjectors] = useState<Projector[]>([]);
  const [nfcNote, setNfcNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, { data: ps }] = await Promise.all([
        supabase.rpc("fn_list_groups"),
        supabase.from("projectors").select("*"),
      ]);
      if (!active) return;
      setGroups(gs ?? []);
      setProjectors((ps as Projector[]) ?? []);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!groupId) {
      setStatus(null);
      return;
    }
    let active = true;
    async function check() {
      const { data, error } = await supabase.rpc("fn_puzzle_status", {
        p_group_id: groupId,
        p_location: location,
      });
      if (!active) return;
      if (error) setError(friendlyError(error));
      else setStatus(data as PuzzleStatus);
    }
    check();
    return () => {
      active = false;
    };
  }, [supabase, groupId, location]);

  async function redeem() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_redeem_puzzle_set", {
      p_group_id: groupId,
      p_location: location,
      p_nfc_note: nfcNote,
    });
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
    } else {
      setNotice(
        `Set redeemed for ${PROJECTOR_LABELS[location]}. Hand over the NFC card now.`
      );
      setStatus((s) => (s ? { ...s, redeemed: true } : s));
    }
  }

  async function manualActivate() {
    if (!groupId) return;
    if (
      !window.confirm(
        `Manually activate ${PROJECTOR_LABELS[location]} for group ${groupId}? This is logged as a manual override.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_activate_projector_manual", {
      p_location: location,
      p_group_id: groupId,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setNotice(`${PROJECTOR_LABELS[location]} activated (manual override).`);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Guardian verification"
        subtitle="Verify puzzle sets and issue NFC cards"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card className="space-y-3">
        <div>
          <label className="label">Projector location</label>
          <div className="grid grid-cols-3 gap-2">
            {PROJECTOR_LOCATIONS.map((loc) => (
              <button
                key={loc}
                onClick={() => setLocation(loc)}
                className={cn(
                  "btn text-sm",
                  location === loc
                    ? "bg-star-violet text-white"
                    : "border border-base-300 bg-white"
                )}
              >
                {loc}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="group">
            Group
          </label>
          <select
            id="group"
            className="input"
            value={groupId ?? ""}
            onChange={(e) => setGroupId(Number(e.target.value) || null)}
          >
            <option value="">Select group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {status && groupId && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              {PROJECTOR_LABELS[location]} set
            </span>
            <span
              className={cn(
                "chip",
                status.complete
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              )}
            >
              {status.pieces}/3 pieces
            </span>
          </div>

          {status.projector_activated ? (
            <p className="text-sm font-semibold text-star-gold">
              🌟 This projector has already been revived.
            </p>
          ) : status.redeemed ? (
            <p className="text-sm font-semibold text-green-700">
              ✅ Already redeemed — the group should tap the NFC sticker during
              Endgame.
            </p>
          ) : status.complete ? (
            <>
              <div>
                <label className="label" htmlFor="nfcNote">
                  Which physical NFC card are you handing over?
                </label>
                <input
                  id="nfcNote"
                  className="input"
                  placeholder={`e.g. ${location} card #1`}
                  value={nfcNote}
                  onChange={(e) => setNfcNote(e.target.value)}
                />
              </div>
              <button
                disabled={busy}
                onClick={redeem}
                className="btn-primary w-full"
              >
                ✅ Confirm set & mark redeemed
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-faint">
              Set incomplete — the group still needs{" "}
              {3 - status.pieces} piece{3 - status.pieces > 1 ? "s" : ""}.
            </p>
          )}

          {status.redeemed && !status.projector_activated && (
            <button
              disabled={busy}
              onClick={manualActivate}
              className="btn-danger w-full"
            >
              ⚠️ Manual activation (sticker damaged)
            </button>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Projector states</h2>
        <ul className="space-y-1 text-sm">
          {projectors.map((p) => (
            <li key={p.location} className="flex justify-between">
              <span>{p.name}</span>
              <span
                className={
                  p.activated_at ? "font-semibold text-star-gold" : "text-ink-faint"
                }
              >
                {p.activated_at
                  ? `🌟 Revived by group ${p.activated_by_group}`
                  : "Dormant"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
