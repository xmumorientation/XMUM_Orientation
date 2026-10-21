import { redirect } from "next/navigation";

import { VictoryTakeover } from "@/components/VictoryTakeover";
import { hashToken, verifyNfcToken } from "@/lib/nfc";
import { activateNfc } from "@/lib/nfc-flow";
import { newlyPowered } from "@/lib/activation-journey";
import { funfairFromState, funfairFromBulbs, funfairMissing, type FunfairPower } from "@/lib/funfair";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { loadProjectorClues, placeKey, projectorPlaces } from "@/lib/projectorPlaces";
import { PROJECTOR_CODE_NAMES, type ProjectorLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

// FR-9.x: the URL written on every physical NFC sticker points here.
// iOS background tag reading & Android both open this natively - the
// codebase contains no Web NFC API usage anywhere.
//
// Validation chain: HMAC signature (server, Node crypto) -> RPC checks
// role/group, Guardian handover, collected pieces, projector free and live phase.

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-night-900 px-8 text-center">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 px-6 py-5 text-3xl font-black tracking-[-0.06em] text-white">
        NFC
      </div>
      <h1 className="mt-6 text-2xl font-bold text-white">{title}</h1>
      <p className="mt-3 text-white/70">{message}</p>
      <a href="/dashboard" className="btn-primary mt-10 min-w-[180px]">
        Back to home
      </a>
    </main>
  );
}

// FR-9.4: clear, non-technical error copy
const ERROR_SCREENS: Record<string, { title: string; message: string }> = {
  TOKEN_USED: {
    title: "Code already used",
    message: "This activation card has already been tapped.",
  },
  TEST_RUN_RESET: {
    title: "Test link expired",
    message: "This NFC test has ended. Ask an Admin to prepare a new test sticker.",
  },
  ALREADY_ACTIVATED: {
    title: "Already lit!",
    message: "This projector has already been lit by another group.",
  },
  SET_NOT_REDEEMED: {
    title: "Not verified yet",
    message:
      "Your group's puzzle set hasn't been verified by the Guardian at this projector. Find the Guardian first!",
  },
  NOT_ENDGAME: {
    title: "Too early!",
    message: "Activation is not open yet. Hold on to your card and follow the committee’s instructions!",
  },
  GROUP_ALREADY_ACTIVATED_ONE: {
    title: "One projector per group",
    message: "Your group has already lit a projector. Amazing work!",
  },
  NFC_DISABLED: {
    title: "Activation paused",
    message: "Activation is temporarily paused by the committee. Try again shortly.",
  },
  NOT_IN_GROUP: {
    title: "No group yet",
    message: "Your account isn't assigned to a group. See the committee for help.",
  },
};

ERROR_SCREENS.NFC_HANDOVER_NOT_VERIFIED = ERROR_SCREENS.SET_NOT_REDEEMED;
ERROR_SCREENS.GROUP_NOT_ASSIGNED = ERROR_SCREENS.NOT_IN_GROUP;
ERROR_SCREENS.NFC_PUZZLES_INCOMPLETE = { title: "Key incomplete", message: "Your group needs every piece of this key before activating. Check your Items and return to the Guardian." };
ERROR_SCREENS.PERMISSION_DENIED = { title: "Facilitator account needed", message: "Ask your group's assigned Facilitator to sign in and tap this sticker." };

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  if (!t) {
    return (
      <ErrorScreen
        title="Invalid NFC link"
        message="This link is missing its NFC code."
      />
    );
  }

  const verified = verifyNfcToken(t);
  if (!verified.valid) {
    return (
      <ErrorScreen
        title="Invalid NFC code"
        message="This code isn't recognised. Copied or forwarded links don't work — tap the real sticker!"
      />
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/activate?t=${t}`)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("group_id")
    .eq("id", user!.id)
    .single();

  const location: ProjectorLocation = verified.location;
  // Where this projector stands, if the caller's group has earned it (all 5 pieces or lit it,
  // 0098); else its code name. Before 0098 the config is read directly (0097).
  async function placeName(): Promise<string> {
    const clues = await loadProjectorClues(supabase);
    if (clues && clues !== "missing") return clues[location]?.place.name ?? PROJECTOR_CODE_NAMES[location];
    const { data: placeRow } = await supabase
      .from("game_config").select("value").eq("key", placeKey(location)).maybeSingle();
    return projectorPlaces({ [placeKey(location)]: placeRow?.value })[location].name;
  }
  const tokenHash = hashToken(t);
  // Metadata lookup only. Redemption always runs with the caller's session,
  // so the service client cannot bypass role, group or inventory checks.
  const { data: card, error: cardError } = await supabaseAdmin()
    .from("nfc_tokens").select("test_run_id, location").eq("token_hash", tokenHash).maybeSingle();
  if (cardError || !card || card.location !== location) return <ErrorScreen title="Can't light this projector" message="Ask the Guardian to check this sticker, then try again." />;

  async function parkPower(): Promise<FunfairPower | null> {
    const result = await supabase.rpc("fn_funfair_state");
    if (!result.error) return funfairFromState(result.data ?? []);
    if (!funfairMissing(result.error)) return null;
    const bulbs = await supabase.rpc("fn_map_lightbulbs");
    return bulbs.error ? null : funfairFromBulbs(bulbs.data ?? []);
  }
  const before = await parkPower();
  const { data: activation, error } = await activateNfc(
    (name, args) => supabase.rpc(name, args), tokenHash, card.test_run_id != null,
  );

  if (error || activation?.ok !== true) {
    const code = Object.keys(ERROR_SCREENS).sort((a, b) => b.length - a.length).find((k) =>
      error?.message.includes(k)
    );
    const screen = code
      ? ERROR_SCREENS[code]
      : {
          title: "Lighting failed",
          message: `Something went wrong lighting ${await placeName()}. Find a committee member.`,
        };
    return <ErrorScreen title={screen.title} message={screen.message} />;
  }

  const after = await parkPower();
  const place = await placeName();
  const replayZones = before && after && !activation?.duplicate ? newlyPowered(before, after) : [];
  const groupId = typeof activation?.group_id === "number" ? activation.group_id : profile?.group_id;
  let groupName: string | null = null;
  if (groupId) {
    const { data: g } = await supabase
      .from("groups")
      .select("name")
      .eq("id", groupId)
      .single();
    groupName = g?.name ?? null;
  }

  return <VictoryTakeover place={place} groupName={groupName} replayZones={replayZones} />;
}
