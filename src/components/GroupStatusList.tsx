"use client";

import { useMemo, useState } from "react";
import { ChevronDown, MessageCircle, Phone } from "lucide-react";

import { FoldBody } from "@/components/staff/game/parts";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FaciStatus, GroupPosition } from "@/lib/types";
import type { GroupPin } from "@/lib/groupPosition";
import { MAX_DRAW_ACCURACY_M, groupPinColor } from "@/lib/mapGeo";
import { LiveText } from "@/components/LiveAgo";
import { friendlyError, timeAgoExact } from "@/lib/utils";

/** "012-345 6789" → "60123456789" for wa.me. Assumes Malaysia when there's no country code. */
export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (phone.trim().startsWith("+")) return digits;
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  return digits;
}

export function pinSummary(g: GroupPosition, pin: GroupPin | null, nowMs: number) {
  if (!pin) {
    if (!g.gps_at) return "No location yet";
    const acc = g.gps_accuracy_m;
    return acc != null && acc > MAX_DRAW_ACCURACY_M
      ? `Only a rough location (±${Math.round(acc)} m), ${timeAgoExact(g.gps_at, nowMs)}`
      : `Outside the campus map, ${timeAgoExact(g.gps_at, nowMs)}`;
  }
  if (pin.area) return `Last seen at ${pin.area} / ${timeAgoExact(pin.at, nowMs)}`;
  if (pin.source === "manual") {
    return `Last seen at ${g.checkin_station_code ?? "a station"} / ${timeAgoExact(pin.at, nowMs)}`;
  }
  const acc = pin.accuracyM != null ? `±${Math.round(pin.accuracyM)} m` : "accuracy unknown";
  return `GPS ${acc} / ${timeAgoExact(pin.at, nowMs)}`;
}

export function reportingSummary(g: GroupPosition) {
  if (g.facis_total === 0) return "No Faci assigned";
  return `${g.facis_reporting} of ${g.facis_total} Faci phones sharing now`;
}

/**
 * One list of every visible group, Group 1 to 10, each with where it was last
 * seen (Ben: one list, not "Not seen" and "On the map"). Tapping a placed group
 * selects its pin; Facis opens its Facilitators and when each phone last
 * shared. Phone numbers only come back for Committee tier.
 */
export function GroupStatusList({
  positions,
  pins,
  onSelect,
}: {
  positions: GroupPosition[];
  pins: Map<number, GroupPin | null>;
  onSelect: (groupId: number) => void;
}) {
  const groups = useMemo(() => [...positions].sort((a, b) => a.group_id - b.group_id), [positions]);

  if (groups.length === 0) return null;

  return (
    <section className="card mt-3 overflow-hidden p-0">
      <h2 className="border-b border-paper-200 px-3 py-2 text-sm font-semibold">Group Locations</h2>
      <ul className="divide-y divide-paper-200">
        {groups.map((g) => (
          <GroupRow key={g.group_id} g={g} pin={pins.get(g.group_id) ?? null} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}

function GroupDot({ groupId }: { groupId: number }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ backgroundColor: groupPinColor(groupId) }}
    >
      {groupId}
    </span>
  );
}

function GroupRow({
  g,
  pin,
  onSelect,
}: {
  g: GroupPosition;
  pin: GroupPin | null;
  onSelect: (groupId: number) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [open, setOpen] = useState(false);
  const [facis, setFacis] = useState<FaciStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The first open loads the Facis before it opens, so the list grows once to
  // its full height (FoldBody) instead of to "Loading…" and then jumping.
  async function load() {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("fn_group_faci_status", {
      p_group_id: g.group_id,
    });
    if (rpcError) setError(friendlyError(rpcError));
    else setFacis((data as FaciStatus[]) ?? []);
  }

  async function toggle() {
    if (open) return setOpen(false);
    if (facis === null) await load();
    else void load();
    setOpen(true);
  }

  return (
    <li>
      <div className="flex items-center gap-3 px-3 py-2">
        <GroupDot groupId={g.group_id} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => pin && onSelect(g.group_id)}
        >
          <span className="block truncate text-sm font-medium">{g.group_name}</span>
          <span className="block truncate text-xs text-ink-faint">
            <LiveText render={(now) => pinSummary(g, pin, now)} />
            {pin?.imprecise && pin.source === "gps" ? " / rough" : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-paper-200 px-2.5 text-xs font-semibold hover:bg-paper-100"
        >
          Facis
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <FoldBody open={open}>
        <div className="group-faci-details px-3 pb-2.5 pt-1">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!error && !facis && <p className="text-xs text-ink-faint">Loading…</p>}
          {facis?.length === 0 && (
            <p className="text-xs text-ink-faint">No Faci is assigned to this group.</p>
          )}
          <ul className="space-y-1.5">
            {facis?.map((f) => {
              const wa = f.phone ? whatsappNumber(f.phone) : null;
              return (
                <li key={f.user_id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.full_name ?? "Faci"}</span>
                    <span className="block truncate text-xs text-ink-faint">
                      {f.last_gps_at ? (
                        <LiveText
                          render={(now) => `Phone last shared ${timeAgoExact(f.last_gps_at!, now)}`}
                        />
                      ) : (
                        "Phone hasn't shared location today"
                      )}
                    </span>
                  </span>
                  {f.phone && (
                    <a
                      href={`tel:${f.phone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white ring-1 ring-paper-200"
                      aria-label={`Call ${f.full_name ?? "Faci"}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                  {wa && (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-green-700 ring-1 ring-paper-200"
                      aria-label={`WhatsApp ${f.full_name ?? "Faci"}`}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </FoldBody>
    </li>
  );
}
