"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  SuccessBanner,
} from "@/components/ui";
import { useProjectorPlaces } from "@/components/useConfig";
import { loadProjectorStates, type ProjectorState } from "@/lib/projectorStates";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";
import { guardianStatus, type PuzzleStatus as NfcPuzzleStatus } from "@/lib/nfc-flow";
import { cn, friendlyError } from "@/lib/utils";

type PuzzleStatus = NfcPuzzleStatus & { verified: boolean };

// FR-8.2: Guardian GM verification flow — check group's pieces, confirm,
// mark redeemed, log the physical NFC card handover.
// FR-9.5: manual activation fallback for damaged stickers.
export default function GuardianPage() {
  const places = useProjectorPlaces();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [location, setLocation] = useState<ProjectorLocation>("B1");
  const [status, setStatus] = useState<PuzzleStatus | null>(null);
  const [projectors, setProjectors] = useState<ProjectorState[]>([]);
  const [nfcNote, setNfcNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canManual, setCanManual] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadPermissions() {
      const { data, error } = await supabase.rpc("fn_nfc_v2_context");
      if (!active) return;
      if (error?.code === "PGRST202") {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (active) setCanManual(["guardian_gm", "hogm", "admin"].includes(profile?.role ?? ""));
      } else setCanManual(!error && data?.can_manual === true);
    }
    void loadPermissions();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: gs }, ps] = await Promise.all([
        supabase.rpc("fn_list_groups"),
        loadProjectorStates(supabase),
      ]);
      if (!active) return;
      setGroups(gs ?? []);
      if (ps) setProjectors(ps);
    }
    void load();
    const poll = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(poll); };
  }, [supabase, revision]);

  useEffect(() => {
    if (!groupId) {
      setStatus(null);
      return;
    }
    setStatus(null);
    let active = true;
    let request = 0;
    async function check() {
      const current = ++request;
      const args = {
        p_group_id: groupId,
        p_location: location,
      };
      let result = await supabase.rpc("fn_nfc_v2_puzzle_status", args);
      if (result.error?.code === "PGRST202") result = await supabase.rpc("fn_puzzle_status", args);
      if (!active || current !== request) return;
      if (result.error) { setStatus(null); setError(friendlyError(result.error)); }
      else { setError(null); setStatus(guardianStatus(result.data as NfcPuzzleStatus)); }
    }
    void check();
    const poll = window.setInterval(check, 5000);
    return () => { active = false; window.clearInterval(poll); };
  }, [supabase, groupId, location, revision]);

  useEffect(() => { setNotice(null); }, [groupId, location]);

  async function redeem() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    let result = await supabase.rpc("fn_nfc_v2_verify_nfc_handover", {
      p_group_id: groupId, p_location: location, p_card_note: nfcNote,
    });
    if (result.error?.code === "PGRST202") result = await supabase.rpc("fn_redeem_puzzle_set", {
      p_group_id: groupId, p_location: location, p_nfc_note: nfcNote,
    });
    const { error } = result;
    setBusy(false);
    if (error) {
      setError(friendlyError(error));
    } else {
      setNotice(
        `Set verified for ${places[location].name}. Hand over the NFC card now.`
      );
      setRevision(value => value + 1);
    }
  }

  async function manualActivate() {
    if (!groupId) return;
    if (
      !window.confirm(
        `Manually light ${places[location].name} for group ${groupId}? This is logged as a manual override.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    let result = await supabase.rpc("fn_nfc_v2_activate_projector_manual", {
      p_location: location,
      p_group_id: groupId,
    });
    if (result.error?.code === "PGRST202") result = await supabase.rpc("fn_activate_projector_manual", {
      p_location: location, p_group_id: groupId,
    });
    const { error } = result;
    setRevision(value => value + 1);
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setNotice(`${places[location].name} lit (manual override).`);
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
                disabled={busy}
                onClick={() => setLocation(loc)}
                className={cn(
                  "btn text-sm",
                  location === loc
                    ? "bg-brand-2 text-white"
                    : "border border-paper-300 bg-white"
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
            disabled={busy}
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
              {places[location].name} set
            </span>
            <span
              className={cn(
                "chip",
                status.complete
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              )}
            >
              {status.pieces}/{status.total} pieces
            </span>
          </div>

          {status.projector_activated ? (
            <p className="text-sm font-semibold text-amber-500">
              This projector is already lit.
            </p>
          ) : status.verified ? (
            <p className="text-sm font-semibold text-green-700">
              Verified — the group’s assigned Facilitator can tap the NFC sticker to light it during the Endgame.
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
                Confirm set and verify card handover
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-faint">
              Set incomplete — the group still needs{" "}
              {status.total - status.pieces} piece
              {status.total - status.pieces > 1 ? "s" : ""}.
            </p>
          )}

          {canManual && status.verified && !status.projector_activated && (
            <button
              disabled={busy}
              onClick={manualActivate}
              className="btn-danger w-full"
            >
              <TriangleAlert size={20} strokeWidth={1.75} />
              Light manually (sticker damaged)
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
                  p.activated_at ? "font-semibold text-amber-500" : "text-ink-faint"
                }
              >
                {/* Which group: Admin and HOGM only (0096). */}
                {p.activated_at
                  ? p.activated_by_group != null ? `Lit by group ${p.activated_by_group}` : "Lit"
                  : "Not lit yet"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
