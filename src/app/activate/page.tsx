import { redirect } from "next/navigation";

import { VictoryTakeover } from "@/components/VictoryTakeover";
import { hashToken, verifyNfcToken } from "@/lib/nfc";
import { supabaseServer } from "@/lib/supabase/server";
import { PROJECTOR_LABELS, type ProjectorLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

// FR-9.x: the URL written on every physical NFC sticker points here.
// iOS background tag reading & Android both open this natively — the
// codebase contains no Web NFC API usage anywhere.
//
// Validation chain: HMAC signature (server, Node crypto) → RPC checks
// unused ∧ set redeemed by this group ∧ projector free ∧ Endgame phase.

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-night-900 px-8 text-center">
      <div className="text-6xl">🔌</div>
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
  ALREADY_ACTIVATED: {
    title: "Already revived!",
    message: "This projector has already been revived by another group.",
  },
  SET_NOT_REDEEMED: {
    title: "Not verified yet",
    message:
      "Your group's puzzle set hasn't been verified by the Guardian at this projector. Find the Guardian first!",
  },
  NOT_ENDGAME: {
    title: "Too early!",
    message: "Projectors can only be revived during the Endgame. Hold on to your card!",
  },
  GROUP_ALREADY_ACTIVATED_ONE: {
    title: "One projector per group",
    message: "Your group has already revived a projector. Amazing work!",
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

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  if (!t) {
    return (
      <ErrorScreen
        title="Invalid activation link"
        message="This link is missing its activation code."
      />
    );
  }

  const verified = verifyNfcToken(t);
  if (!verified.valid) {
    return (
      <ErrorScreen
        title="Invalid activation code"
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

  const { error } = await supabase.rpc("fn_activate_projector", {
    p_token_hash: hashToken(t),
  });

  const location: ProjectorLocation = verified.location;

  // Look the projector up regardless — if activation failed because this
  // same group already did it (e.g. page refresh), still show the victory.
  const { data: projector } = await supabase
    .from("projectors")
    .select("activated_by_group")
    .eq("location", location)
    .single();

  const ownGroupWon =
    projector?.activated_by_group != null &&
    projector.activated_by_group === profile?.group_id;

  if (error && !ownGroupWon) {
    const code = Object.keys(ERROR_SCREENS).find((k) =>
      error.message.includes(k)
    );
    const screen = code
      ? ERROR_SCREENS[code]
      : {
          title: "Activation failed",
          message: `Something went wrong reviving ${PROJECTOR_LABELS[location]}. Find a committee member.`,
        };
    return <ErrorScreen title={screen.title} message={screen.message} />;
  }

  let groupName: string | null = null;
  if (profile?.group_id) {
    const { data: g } = await supabase
      .from("groups")
      .select("name")
      .eq("id", profile.group_id)
      .single();
    groupName = g?.name ?? null;
  }

  return <VictoryTakeover location={location} groupName={groupName} />;
}
