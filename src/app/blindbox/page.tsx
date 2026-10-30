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
    <AuthShell role={title} lead={message} backHref="/dashboard" backLabel="Back to Home">
      {null}
    </AuthShell>
  );
}

const UNKNOWN = {
  title: "Code Not Active",
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
    return <ErrorScreen title="Invalid QR Code" message="This blind box code isn't recognised. Scan a real blind box QR." />;
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
    // Closed by the Day 2 inner schedule (0102): the seller's QR is greyed too.
    if (error.message.includes("BB_NOT_YET")) {
      return <ErrorScreen title="Opens When the Day 2 Game Starts" message="Blind boxes can't be bought yet. Nothing was charged." />;
    }
    if (error.message.includes("BB_OFF_BY_ADMIN")) {
      return <ErrorScreen title="Switched Off by Admin" message="Blind boxes can't be bought right now. Nothing was charged." />;
    }
    return (
      <ErrorScreen title="Something Went Wrong" message="Couldn't load the blind box. Find a committee member for help." />
    );
  }

  // The group's colour for the page (Admin → Freshies; the default blue if unset).
  const { data: me } = await supabase.from("profiles").select("group_id").eq("id", user.id).single();
  const { data: group } = me?.group_id
    ? await supabase.from("groups").select("color").eq("id", me.group_id).maybeSingle()
    : { data: null };

  // One code per box type (bb4, a seller with two or more types): only that
  // type is shown, so the Freshie scans and buys, with nothing to choose.
  // An old seller-wide code (bb3) of a seller who now has several types asks
  // for the right one instead.
  let preview = data as BlindBoxPreview;
  if (token.assignmentId !== undefined) {
    const only = preview.options.filter((o) => o.assignment_id === token.assignmentId);
    if (only.length === 0) return <ErrorScreen {...UNKNOWN} />;
    preview = {
      ...preview,
      options: only,
      status: preview.status === "ok" && only[0].status === "sold_out" ? "sold_out" : preview.status,
    };
  } else if (preview.options.length > 1) {
    return (
      <ErrorScreen
        title="Scan the Box's Own Code"
        message="This seller has more than one box, each with its own QR. Scan the code of the box you want."
      />
    );
  }

  return (
    <BlindBoxBuy
      sellerId={token.sellerId}
      version={token.version}
      preview={preview}
      color={(group?.color as string | null) ?? null}
    />
  );
}
