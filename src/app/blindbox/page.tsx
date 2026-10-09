import { Package } from "lucide-react";
import { redirect } from "next/navigation";

import { BlindBoxOpener } from "@/components/BlindBoxOpener";
import { verifyBlindBoxToken } from "@/lib/blindbox";
import { supabaseServer } from "@/lib/supabase/server";
import type { BlindBoxPreview } from "@/lib/types";

export const dynamic = "force-dynamic";

// Blind-box QR landing. The seller's QR encodes /blindbox?t=<signed-token>.
// Opening this page only PREVIEWS the box (fn_bb_preview): nothing is paid
// and no box is deducted until the Freshie taps Open (fn_open_blind_box).

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-night-900 px-8 text-center">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10"
      >
        <Package size={28} strokeWidth={1.75} className="text-white" />
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
  BOX_UNKNOWN: {
    title: "Code not active",
    message:
      "This QR code isn't active any more. Ask the seller to show their latest QR.",
  },
  FRESHIE_ONLY: {
    title: "Freshies only",
    message: "Blind boxes can only be opened by Freshie accounts.",
  },
  NOT_IN_GROUP: {
    title: "No group yet",
    message: "Your account isn't assigned to a group yet — see the registration counter.",
  },
};

export default async function BlindBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  const token = t ? verifyBlindBoxToken(t) : null;
  if (!t || !token || !token.valid) {
    return (
      <ErrorScreen
        title="Invalid QR code"
        message="This blind box code isn't recognised. Scan the seller's real QR!"
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

  const { data, error } = await supabase.rpc("fn_bb_preview", {
    p_assignment_id: token.assignmentId,
    p_version: token.version,
  });

  if (error) {
    const code = Object.keys(ERROR_SCREENS).find((k) =>
      error.message.includes(k)
    );
    const screen = code
      ? ERROR_SCREENS[code]
      : {
          title: "Something went wrong",
          message: "Couldn't load the blind box. Find a committee member for help.",
        };
    return <ErrorScreen title={screen.title} message={screen.message} />;
  }

  return (
    <BlindBoxOpener
      assignmentId={token.assignmentId}
      version={token.version}
      preview={data as BlindBoxPreview}
    />
  );
}
