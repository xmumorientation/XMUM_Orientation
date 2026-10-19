import { Package } from "lucide-react";

import { BlindBoxBuy } from "@/components/BlindBoxBuy";
import { BlindBoxLogin } from "@/components/BlindBoxLogin";
import { verifyBlindBoxToken } from "@/lib/blindbox";
import { supabaseServer } from "@/lib/supabase/server";
import type { BlindBoxPreview } from "@/lib/types";

export const dynamic = "force-dynamic";

// Blind-box QR landing: ONE code per seller, /blindbox?t=<signed-token>. The
// page is public, so it works from the in-app scanner and from any outside
// scanner alike:
//   signed in as a Freshie group -> the buy screen straight away
//   not signed in                -> pick the group + 4-digit password, then the
//                                   same URL shows the buy screen
//   signed in as staff / Faci    -> offer to switch to a Freshie login
// Opening the page only PREVIEWS (fn_bb_seller_preview): nothing is paid and
// no box is taken until BUY is tapped (fn_bb_buy). The bought box is opened
// from the Items page (fn_bb_open).

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

  // Who is selling (public: the name only, and only for a valid code).
  const { data: seller, error: sellerError } = await supabase.rpc("fn_bb_seller_public", {
    p_seller_id: token.sellerId,
    p_version: token.version,
  });
  if (sellerError) {
    return <ErrorScreen {...ERROR_SCREENS.BOX_UNKNOWN} />;
  }
  const sellerName = (seller as { seller_name: string }).seller_name;

  if (!user) {
    return <BlindBoxLogin sellerName={sellerName} />;
  }

  const { data, error } = await supabase.rpc("fn_bb_seller_preview", {
    p_seller_id: token.sellerId,
    p_version: token.version,
  });

  if (error) {
    if (error.message.includes("FRESHIE_ONLY")) {
      return <BlindBoxLogin sellerName={sellerName} notFreshie />;
    }
    const code = Object.keys(ERROR_SCREENS).find((k) => error.message.includes(k));
    const screen = code
      ? ERROR_SCREENS[code]
      : {
          title: "Something went wrong",
          message: "Couldn't load the blind box. Find a committee member for help.",
        };
    return <ErrorScreen title={screen.title} message={screen.message} />;
  }

  return (
    <BlindBoxBuy
      sellerId={token.sellerId}
      version={token.version}
      preview={data as BlindBoxPreview}
    />
  );
}
