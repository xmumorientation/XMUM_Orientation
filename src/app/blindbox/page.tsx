import { AuthShell } from "@/components/auth/AuthShell";
import { BlindBoxBuy } from "@/components/BlindBoxBuy";
import { BlindBoxLogin } from "@/components/BlindBoxLogin";
import { verifyBlindBoxToken } from "@/lib/blindbox";
import { supabaseServer } from "@/lib/supabase/server";
import type { BlindBoxPreview } from "@/lib/types";

export const dynamic = "force-dynamic";

// Blind-box QR landing: ONE code per seller (or the Spot), /blindbox?t=<signed-token>.
// The page is public, so it works from the in-app scanner and from any outside
// scanner alike:
//   signed in as a Freshie group -> the buy screen, in the group's colour
//   not signed in                -> pick the group + 4-digit password, then the
//                                   same URL shows the buy screen
//   signed in as staff / Faci    -> offer to switch to a Freshie login
// Opening the page only PREVIEWS (fn_bb_seller_preview): nothing is paid and
// no box is taken until BUY is tapped (fn_bb_buy). The bought box is opened
// from the Items page (fn_bb_open).

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <AuthShell role={title} lead={message} backHref="/dashboard" backLabel="Back to home">
      {null}
    </AuthShell>
  );
}

const UNKNOWN = {
  title: "Code not active",
  message: "This QR code isn't active right now. Ask the seller to show their latest QR.",
};

export default async function BlindBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  const token = t ? verifyBlindBoxToken(t) : null;
  if (!t || !token || !token.valid) {
    return <ErrorScreen title="Invalid QR code" message="This blind box code isn't recognised. Scan a real blind box QR." />;
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
  if (sellerError) return <ErrorScreen {...UNKNOWN} />;
  const { seller_name: sellerName, spot } = seller as { seller_name: string; spot?: boolean };

  if (!user) {
    return <BlindBoxLogin sellerName={sellerName} spot={spot} />;
  }

  const { data, error } = await supabase.rpc("fn_bb_seller_preview", {
    p_seller_id: token.sellerId,
    p_version: token.version,
  });

  if (error) {
    if (error.message.includes("FRESHIE_ONLY")) {
      return <BlindBoxLogin sellerName={sellerName} spot={spot} notFreshie />;
    }
    // A personal Freshie account with no group: offer the group login.
    if (error.message.includes("NOT_IN_GROUP")) {
      return <BlindBoxLogin sellerName={sellerName} spot={spot} notFreshie noGroup />;
    }
    if (error.message.includes("BOX_UNKNOWN")) return <ErrorScreen {...UNKNOWN} />;
    return (
      <ErrorScreen title="Something went wrong" message="Couldn't load the blind box. Find a committee member for help." />
    );
  }

  // The group's colour for the page (Admin → Freshies; the default blue if unset).
  const { data: me } = await supabase.from("profiles").select("group_id").eq("id", user.id).single();
  const { data: group } = me?.group_id
    ? await supabase.from("groups").select("color").eq("id", me.group_id).maybeSingle()
    : { data: null };

  return (
    <BlindBoxBuy
      sellerId={token.sellerId}
      version={token.version}
      preview={data as BlindBoxPreview}
      color={(group?.color as string | null) ?? null}
    />
  );
}
