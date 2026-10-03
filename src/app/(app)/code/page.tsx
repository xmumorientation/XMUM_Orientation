"use client";

import { redirect } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { groupColor } from "@/components/freshie/groupTheme";
import { useGroup } from "@/components/useGroup";
import { PageTitle, Spinner } from "@/components/ui";
import { groupQrPng, saveGroupQr } from "@/lib/group-qr";
import { supabaseBrowser } from "@/lib/supabase/client";

// The facilitator's own group card: password, join link, and QR.
export default function GroupCodePage() {
  const profile = useProfile();
  const { group, loading: groupLoading } = useGroup();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [code, setCode] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
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
    if (!code || !group) return;
    let active = true;
    groupQrPng(group.id, code, groupColor(group.color)).then((file) => {
      if (active) setPng(file);
    });
    return () => {
      active = false;
    };
  }, [code, group]);

  if (profile.role !== "faci") redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4">
      <PageTitle title="Group code" subtitle="The password, link, and QR for your group" />
      {!ready || groupLoading ? (
        <Spinner />
      ) : !code || !group ? (
        <p className="text-sm text-ink-faint">This group does not have a login code yet.</p>
      ) : (
        <>
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
