import { redirect } from "next/navigation";

import { BoxReveal } from "@/components/BoxReveal";
import { hashToken, verifyBlindBoxToken } from "@/lib/blindbox";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Committee blind-box QR landing. The printed/on-phone QR encodes
// /blindbox?t=<signed-token>. A logged-in Freshie scanning it gets the
// opening animation; the RPC enforces stock and one-claim-per-group.

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-night-900 px-8 text-center">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-3xl"
      >
        📦
      </div>
      <h1 className="mt-6 text-2xl font-bold text-white">{title}</h1>
      <p className="mt-3 text-white/70">{message}</p>
      <a href="/dashboard" className="btn-primary mt-10 min-w-[180px]">
        Back to home
      </a>
    </main>
  );
}

const ERROR_SCREENS: Record<string, { title: string; message: string }> = {
  ALREADY_CLAIMED_FROM_MEMBER: {
    title: "Already opened!",
    message:
      "Your group has already opened a blind box from this committee member. Find a different one!",
  },
  BOXES_SOLD_OUT: {
    title: "All gone!",
    message: "This committee member has given out all their blind boxes.",
  },
  BOX_UNKNOWN: {
    title: "Unknown box",
    message: "This QR code isn't active. Ask the committee member to check with Admin.",
  },
  FRESHIE_ONLY: {
    title: "Freshies only",
    message: "Blind boxes can only be opened by Freshie accounts.",
  },
  NOT_IN_GROUP: {
    title: "No group yet",
    message: "Your account isn't assigned to a group yet — see the registration counter.",
  },
  TOKENS_FROZEN: {
    title: "Paused",
    message: "Token operations are briefly paused by the committee. Try again shortly.",
  },
};

export default async function BlindBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  if (!t || !verifyBlindBoxToken(t).valid) {
    return (
      <ErrorScreen
        title="Invalid QR code"
        message="This blind box code isn't recognised. Scan the committee member's real QR!"
      />
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/blindbox?t=${t}`)}`);
  }

  const { data, error } = await supabase.rpc("fn_scan_blind_box", {
    p_qr_hash: hashToken(t),
  });

  if (error) {
    const code = Object.keys(ERROR_SCREENS).find((k) =>
      error.message.includes(k)
    );
    const screen = code
      ? ERROR_SCREENS[code]
      : {
          title: "Something went wrong",
          message: "Couldn't open the blind box. Find a committee member for help.",
        };
    return <ErrorScreen title={screen.title} message={screen.message} />;
  }

  const result = data as {
    tokens: number;
    special: boolean;
    member_name: string | null;
    balance: number;
  };

  return (
    <BoxReveal
      tokens={result.tokens}
      special={result.special}
      memberName={result.member_name}
      balance={result.balance}
    />
  );
}
