"use client";

import { redirect } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { groupColor } from "@/components/freshie/groupTheme";
import { useGroup } from "@/components/useGroup";
import { ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { groupQrPng, saveGroupQr } from "@/lib/group-qr";
import { groupQrUrl } from "@/lib/group-qr-url";
import { supabaseBrowser } from "@/lib/supabase/client";

// The facilitator's own group card: password, join link, and QR.
export default function GroupCodePage() {
  const profile = useProfile();
  const { group, loading: groupLoading } = useGroup();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [code, setCode] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const color = groupColor(group?.color);
  const groupId = group?.id;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: rpcError } = await supabase.rpc("fn_my_group_code");
      if (!active) return;
      setCodeError(rpcError ? "Could not load the password. Please reload to try again." : null);
      setCode(typeof data === "string" && data.length === 4 ? data : null);
      setReady(true);
    }
    load().catch(() => {
      if (active) {
        setCodeError("Could not load the password. Please reload to try again.");
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (profile.role !== "faci" || groupId == null) return;
    let active = true;
    setError(null);
    setPng(null);
    (async () => {
      const url = await groupQrUrl(profile.id, groupId);
      const file = await groupQrPng(`GROUP ${groupId}`, url, color);
      if (active) setPng(file);
    })().catch(() => { if (active) setError("Could not generate the QR code. Please reload to try again."); });
    return () => {
      active = false;
    };
  }, [profile.id, profile.role, groupId, color]);

  if (profile.role !== "faci") redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4">
      <PageTitle title="Group code" subtitle="Your group's password and QR. The QR never changes; the password can." />
      <ErrorBanner message={error} />
      <ErrorBanner message={codeError} />
      {groupLoading ? (
        <Spinner />
      ) : !group ? (
        <p className="text-sm text-ink-faint">You have not been assigned to a group yet.</p>
      ) : (
        <>
          <p className="text-center">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-faint">Password</span>
            <span className="font-mono text-4xl font-bold tracking-[0.2em] text-ink">{ready ? (code ?? "—") : "…"}</span>
          </p>
          {ready && !code && !codeError && <p className="text-sm text-ink-faint">This group does not have a login code yet.</p>}
          {!png && !error && <Spinner />}
          {png && (
            // The card is a generated image, same file Freshie control downloads.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={png} alt={`${group.name} login code`} className="w-full rounded-[28px]" />
          )}
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!png}
            onClick={() => png && saveGroupQr(group.id, png)}
          >
            Download
          </button>
        </>
      )}
    </div>
  );
}
