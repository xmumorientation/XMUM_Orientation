"use client";

import { Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { groupQrPng, saveGroupQr } from "@/lib/group-qr";
import { groupQrUrl } from "@/lib/group-qr-url";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";

import { groupColor } from "./groupTheme";

// Group code on Faci Home (02, where the Checklist used to be; the Checklist
// is now the center tab, /checklist). The group's password and its QR card:
// Freshies scan the QR or type the password to open their group's page.
// The QR never changes; Admin can give the group a new password.

function useGroupCode(group: Group | null) {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [code, setCode] = useState<string | null>(null);
  const [codeReady, setCodeReady] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const color = groupColor(group?.color);
  const groupId = group?.id;

  useEffect(() => {
    let active = true;
    supabase.rpc("fn_my_group_code").then(
      ({ data, error }) => {
        if (!active) return;
        setCodeError(!!error);
        setCode(typeof data === "string" && data.length === 4 ? data : null);
        setCodeReady(true);
      },
      () => {
        if (!active) return;
        setCodeError(true);
        setCodeReady(true);
      }
    );
    return () => {
      active = false;
    };
  }, [supabase, attempt]);

  useEffect(() => {
    if (groupId == null) return;
    let active = true;
    setQrError(false);
    setPng(null);
    (async () => {
      const url = await groupQrUrl(profile.id, groupId);
      const file = await groupQrPng(`GROUP ${groupId}`, url, color);
      if (active) setPng(file);
    })().catch(() => {
      if (active) setQrError(true);
    });
    return () => {
      active = false;
    };
  }, [profile.id, groupId, color, attempt]);

  return { code, codeReady, codeError, png, qrError, retry: () => setAttempt((n) => n + 1) };
}

export function GroupCodeStop({ group }: { group: Group | null }) {
  const { code, codeReady, codeError, png, qrError, retry } = useGroupCode(group);
  const digits = codeReady ? (code ?? "----").split("") : ["", "", "", ""];

  return (
    <section id="fh-code" className="fh-stop" aria-labelledby="fh-code-title">
      <div className="fh-stop-head">
        <h2 id="fh-code-title" className="fh-h2 fh-slab">Group Code</h2>
        <p className="fh-lead">Freshies scan the QR or type the password to open your group&apos;s page.</p>
      </div>

      {!group ? (
        <div className="fh-pending">
          <div className="fh-eb fh-mono">● Group Pending</div>
          <p>You have not been assigned to a group yet. Admin assigns Facilitators in Freshie Control.</p>
        </div>
      ) : (
        <div className="fh-gc">
          <div className="fh-gc-qr">
            {png ? (
              // The card is a generated image, same file Freshie control downloads.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={png} alt={`${group.name} QR code`} />
            ) : qrError ? (
              <div className="fh-gc-qr-msg" role="alert">
                <p>Could not make the QR code.</p>
                <button type="button" className="fh-btn fh-btn-ghost" onClick={retry}>
                  <RefreshCw size={16} aria-hidden /> Try again
                </button>
              </div>
            ) : (
              <div className="fh-gc-qr-msg" aria-label="Loading the QR code">
                <span className="fh-gc-spin" aria-hidden />
              </div>
            )}
          </div>

          <div className="fh-gc-side">
            <div className="fh-gc-pass">
              <span className="fh-eb fh-mono">Password</span>
              <div className="fh-gc-digits" aria-label={code ? `Password ${code.split("").join(" ")}` : "No password"}>
                {digits.map((d, i) => (
                  <span key={i} className="fh-slab" data-empty={!codeReady || undefined} aria-hidden>
                    {d}
                  </span>
                ))}
              </div>
              {codeReady && codeError && <small role="alert">Could not load the password. Try again in a moment.</small>}
              {codeReady && !code && !codeError && <small>This group does not have a password yet.</small>}
              {code && <small>The QR never changes. Admin can give your group a new password.</small>}
            </div>
            <button
              type="button"
              className="fh-btn fh-btn-primary fh-gc-dl"
              disabled={!png}
              onClick={() => png && saveGroupQr(group.id, png)}
            >
              <Download size={18} aria-hidden /> Download QR
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
