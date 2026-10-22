"use client";

import { redirect } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { groupColor } from "@/components/freshie/groupTheme";
import { useGroup } from "@/components/useGroup";
import { ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { groupQrPng, saveGroupQr } from "@/lib/group-qr";
import { supabaseBrowser } from "@/lib/supabase/client";

// The facilitator's own group card: password, join link, and QR.
export default function GroupCodePage() {
  const profile = useProfile();
  const { group, loading: groupLoading } = useGroup();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [code, setCode] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const color = groupColor(group?.color);
  const groupId = group?.id;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.rpc("fn_my_group_code");
      if (!active) return;
      setCode(typeof data === "string" && data.length === 4 ? data : null);
      setReady(true);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!code || groupId == null) return;
    let active = true;
    setError(null);
    setPng(null);
    (async () => {
      const res = await fetch("/api/group-join");
      const url = res.ok ? ((await res.json()).urls?.[groupId] as string | undefined) : undefined;
      if (!url) throw new Error("Group QR unavailable");
      const file = await groupQrPng(`GROUP ${groupId}`, url, color);
      if (active) setPng(file);
    })().catch(() => { if (active) setError("Could not generate the QR code. Please reload to try again."); });
    return () => {
      active = false;
    };
  }, [code, groupId, color]);

  if (profile.role !== "faci") redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4">
      <PageTitle title="Group code" subtitle="Your group's password and QR. The QR never changes; the password can." />
      <ErrorBanner message={error} />
      {!ready || groupLoading ? (
        <Spinner />
      ) : !code || !group ? (
        <p className="text-sm text-ink-faint">This group does not have a login code yet.</p>
      ) : (
        <>
          <p className="text-center">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-faint">Password</span>
            <span className="font-mono text-4xl font-bold tracking-[0.2em] text-ink">{code}</span>
          </p>
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
