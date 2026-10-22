"use client";

import { ArrowLeft, ArrowRight, Ban, Check, Package, Pause, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { themeFromColor } from "@/components/freshie/groupTheme";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import "@/components/freshie/freshie.css";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  BlindBoxBuyResult,
  BlindBoxOption,
  BlindBoxPageStatus,
  BlindBoxPreview,
} from "@/lib/types";
import { friendlyError, idemKey } from "@/lib/utils";

type Blocked = Exclude<BlindBoxPageStatus, "ok">;

// What the page says instead of the box list. Nothing here charges anything.
function blockedText(status: Blocked, p: BlindBoxPreview): { title: string; message: string; Icon: typeof Pause } {
  switch (status) {
    case "disabled":
      return { Icon: Pause, title: "Paused", message: "The committee has paused blind boxes. Try again shortly." };
    case "frozen":
      return { Icon: Pause, title: "Paused", message: "The committee has paused tokens for a moment. Try again shortly." };
    case "sold_out":
      return p.spot
        ? { Icon: Ban, title: "All Found!", message: "Every hidden box has been claimed already." }
        : { Icon: Ban, title: "All Gone!", message: `${p.seller_name} has sold all their blind boxes.` };
    case "already_from_seller":
      return p.spot
        ? { Icon: Check, title: "Already Yours", message: `${p.group_name} already claimed a hidden box. Find it in My Items.` }
        : {
            Icon: Check,
            title: "Already Bought",
            message: `${p.group_name} already bought a box from ${p.seller_name}. Find another seller! Your box is in My Items.`,
          };
    case "cap_reached":
      return { Icon: Ban, title: "No More Boxes", message: `${p.group_name} has bought all ${p.cap} boxes it can.` };
  }
}

const tokens = (n: number) => `${n} token${n !== 1 ? "s" : ""}`;

/** "Gold" -> "Gold Box"; a type already named "... Box" keeps its name. */
const boxTitle = (typeName: string) => (/box$/i.test(typeName) ? typeName : `${typeName} Box`);

function optionNote(o: BlindBoxOption, balance: number): string {
  if (o.status === "sold_out") return "Sold out";
  if (o.status === "insufficient") return `Need ${tokens(o.price - balance)} more`;
  return `${o.left} left`;
}

// Scan page for a signed-in Freshie group, in the group's own colour. The box
// is the blind box poster art (public/blind-box-poster.jpg), its dark edges
// faded into the page. It shows
// which group is buying and what the seller has; the price is charged and a
// box taken only when BUY is tapped. The box then waits in the group's Items,
// where it is opened. A Spot (hidden) box is free and is claimed the same way.
export function BlindBoxBuy({
  sellerId,
  version,
  preview,
  color,
}: {
  sellerId: number;
  version: number;
  preview: BlindBoxPreview;
  color: string | null;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  // One key per screen visit: a double-tap or a retry applies exactly once.
  const [key] = useState(() => idemKey());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState<BlindBoxBuyResult | null>(null);

  const theme = themeFromColor(color);
  const spot = !!preview.spot;
  const special = preview.options.some((o) => o.special);

  async function buy(option: BlindBoxOption) {
    setBusyId(option.assignment_id);
    setError(null);
    // Charged only at the price shown here: if Admin changed it meanwhile,
    // nothing is charged (BB_PRICE_CHANGED).
    const args = {
      p_seller_id: sellerId,
      p_version: version,
      p_assignment_id: option.assignment_id,
      p_idempotency_key: key,
    };
    let { data, error: err } = await supabase.rpc("fn_bb_buy_at", { ...args, p_expected_price: option.price });
    // Migration 0091 not run yet: buy without the price check.
    if (err?.code === "PGRST202") ({ data, error: err } = await supabase.rpc("fn_bb_buy", args));
    setBusyId(null);
    if (err) {
      setError(friendlyError(err));
      // Balance, stock or price changed since this screen loaded: show them.
      router.refresh();
    } else setBought(data as BlindBoxBuyResult);
  }

  const blocked = preview.status === "ok" ? null : blockedText(preview.status, preview);
  const balance = bought?.balance ?? preview.balance;

  return (
    <div
      className={`fh bbuy ${vxDisplay.variable} ${vxSlab.variable}`}
      style={
        {
          "--fh-accent": theme.accent,
          "--fh-glow": theme.glow,
          "--fh-blue": theme.accent,
          "--fh-blue-light": theme.accentLight,
          "--fh-on-blue": theme.onAccent,
        } as React.CSSProperties
      }
    >
      <main className="bbuy-col">
        <header className="bbuy-top">
          <Link href="/dashboard" className="bbuy-back">
            <ArrowLeft size={18} aria-hidden /> Home
          </Link>
          <span className="fh-pill fh-mono bbuy-who">
            <i aria-hidden />
            {preview.group_name} · {tokens(balance)}
          </span>
        </header>

        <p className="bbuy-eyebrow fh-mono">{bought ? `Bought from ${preview.seller_name}` : spot ? "You found a hidden Blind Box" : "Blind Box from"}</p>
        <h1 className="bbuy-title fh-slab">
          {bought ? (bought.special ? "A Special Box!" : boxTitle(bought.type_name)) : spot ? "Hidden Box" : preview.seller_name}
        </h1>

        <div className="bb-flow bbuy-art" data-kind={(bought?.special ?? special) ? "gold" : "standard"}>
          <div className="bbuy-scene" data-stage="sealed" key={bought ? "bought" : "shown"}>
            <span className="bbuy-light" aria-hidden />
            <Image
              src="/blind-box-poster.jpg"
              alt=""
              width={640}
              height={640}
              sizes="(max-width: 480px) 76vw, 340px"
              priority
              className="bbuy-box"
            />
            <span className="bb-shadow" aria-hidden />
          </div>
        </div>

        {bought ? (
          <section className="bbuy-done" aria-live="polite">
            <dl className="bbuy-receipt" data-cells={spot ? 2 : 3}>
              <div>
                <dt className="fh-mono">Paid</dt>
                <dd className="fh-slab">{bought.price > 0 ? bought.price : "Free"}</dd>
                <small>{bought.price > 0 ? "tokens" : ""}</small>
              </div>
              <div>
                <dt className="fh-mono">Tokens Left</dt>
                <dd className="fh-slab">{balance}</dd>
                <small>tokens</small>
              </div>
              {!spot && (
                <div>
                  <dt className="fh-mono">Boxes</dt>
                  <dd className="fh-slab">
                    {Math.min(preview.group_claims + 1, preview.cap)}
                    <span>/{preview.cap}</span>
                  </dd>
                  <small className="bbuy-dots" aria-hidden>
                    {Array.from({ length: preview.cap }, (_, i) => (
                      <i key={i} data-on={i <= preview.group_claims || undefined} />
                    ))}
                  </small>
                </div>
              )}
            </dl>
            <p className="bbuy-note">
              <Package size={20} aria-hidden />
              <span>
                <b>Still sealed.</b> You see the prize when you open it.
              </span>
            </p>
            <div className="bbuy-actions">
              <Link href="/inventory" className="fh-btn fh-btn-primary fh-btn-block">
                Open it in Items <ArrowRight size={18} aria-hidden />
              </Link>
              <Link href="/scan" className="fh-btn fh-btn-ghost fh-btn-block">
                Scan another QR
              </Link>
            </div>
          </section>
        ) : blocked ? (
          <section className="bbuy-state">
            <blocked.Icon size={22} aria-hidden />
            <div>
              <b>{blocked.title}</b>
              <p>{blocked.message}</p>
            </div>
          </section>
        ) : (
          <section>
            <div className="bbuy-head">
              <h2>{spot ? "Claim It" : "Pick a Box"}</h2>
              {!spot && (
                <span className="bbuy-cap fh-mono" aria-label={`Bought ${preview.group_claims} of ${preview.cap}`}>
                  {Array.from({ length: preview.cap }, (_, i) => (
                    <i key={i} data-on={i < preview.group_claims || undefined} />
                  ))}
                  {preview.group_claims}/{preview.cap}
                </span>
              )}
            </div>
            {error && (
              <p role="alert" className="bbuy-error">
                {error}
              </p>
            )}
            <ul className="bbuy-list">
              {preview.options.map((o, i) => (
                <li key={o.assignment_id} style={{ "--i": i } as React.CSSProperties} data-off={o.status !== "ok" || undefined}>
                  <div className="bbuy-opt">
                    <b>
                      {spot ? "Hidden Box" : o.type_name}
                      {o.special && <Sparkles size={15} aria-label="special" />}
                    </b>
                    <small>{optionNote(o, preview.balance)}</small>
                  </div>
                  <span className="bbuy-price fh-mono">{o.price > 0 ? tokens(o.price) : "Free"}</span>
                  <button
                    type="button"
                    onClick={() => buy(o)}
                    disabled={busyId !== null || o.status !== "ok"}
                    className="fh-btn fh-btn-primary bbuy-btn"
                  >
                    {busyId === o.assignment_id ? "…" : spot ? "Claim it" : "Buy"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!bought && (
          <Link href="/inventory" className="bbuy-items">
            My Items <ArrowRight size={16} aria-hidden />
          </Link>
        )}
      </main>
    </div>
  );
}
