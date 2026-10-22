"use client";

import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AssignTab } from "@/components/admin/blindbox/AssignTab";
import { CodesTab } from "@/components/admin/blindbox/CodesTab";
import { SettingsTab } from "@/components/admin/blindbox/SettingsTab";
import { SpotTab } from "@/components/admin/blindbox/SpotTab";
import { TypesTab, type Step } from "@/components/admin/blindbox/TypesTab";
import { useBlindBoxAdmin } from "@/components/admin/blindbox/useBlindBoxAdmin";
import { ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { cn } from "@/lib/utils";

// The flow, in order. Rules & reset sits apart: it is not a step.
const STEPS: [Step, string][] = [
  ["types", "Box types"],
  ["assign", "Assign"],
  ["codes", "Codes & stock"],
  ["spot", "Spot box"],
];

// Admin blind boxes, as the steps of the job:
//   1 Box types      what boxes exist: prize range, price, stock
//   2 Assign         hand boxes to people (one account, picked accounts, a role)
//   3 Codes & stock  one row per seller: their QR, and sold / left per type
//   4 Spot box       the one hidden QR to print: range, pool, on/off
//   Rules & reset    the per-group limit and the rehearsal reset
// A Freshie scans a QR, sees a buy screen, and taps BUY; the box waits in
// their Items until they open it.
export default function AdminBlindBoxPage() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onError = useCallback((m: string | null) => setError(m), []);
  const onNotice = useCallback((m: string) => {
    setNotice(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 3000);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const data = useBlindBoxAdmin(onError);
  const o = data.overview;
  // Opens on step 1 until a box type exists, then on Codes & stock.
  const current: Step = step ?? (data.types.some((t) => !t.archived) ? "codes" : "types");

  const stats: [string, number][] = [
    ["left with sellers", o.left],
    ["sold", o.opened],
    ["unassigned", o.unassigned],
    [`groups at the limit of ${data.cap}`, o.groupsAtCap],
  ];

  const tabProps = { data, onError, onNotice, goTo: setStep };

  return (
    <div className="space-y-5">
      <PageTitle title="Blind boxes" subtitle="Create box types, hand them out, then give out the codes" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <div>
        <dl className="grid grid-cols-2 gap-y-3 border-y border-paper-200 py-3 sm:grid-cols-4 sm:divide-x sm:divide-paper-200">
          {stats.map(([label, value]) => (
            <div key={label} className="sm:px-4 sm:first:pl-0">
              <dt className="text-xs text-ink-faint">{label}</dt>
              <dd className="font-mono text-2xl font-bold tabular-nums">{data.loaded ? value : "–"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-faint">
          Tokens: <b className="font-mono text-ink">{o.tokensIn}</b> paid in for boxes /{" "}
          <b className="font-mono text-ink">{o.tokensOut}</b> won from opened boxes
        </p>
      </div>

      <nav role="tablist" className="flex flex-wrap items-center gap-1.5">
        {STEPS.map(([key, label], i) => (
          <button
            key={key}
            role="tab"
            aria-selected={current === key}
            onClick={() => setStep(key)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition active:scale-[0.98]",
              current === key
                ? "border-ink bg-ink text-white"
                : "border-paper-300 bg-white text-ink-faint hover:border-ink-faint hover:text-ink"
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full font-mono text-[11px]",
                current === key ? "bg-white text-ink" : "bg-paper-200 text-ink"
              )}
            >
              {i + 1}
            </span>
            {label}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={current === "settings"}
          onClick={() => setStep("settings")}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-[0.98]",
            current === "settings" ? "bg-ink text-white" : "text-ink-faint hover:text-ink"
          )}
        >
          <Settings2 size={16} strokeWidth={1.75} aria-hidden />
          Rules & reset
        </button>
      </nav>

      {!data.loaded ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-paper-200" />
          ))}
        </div>
      ) : (
        <>
          {current === "types" && <TypesTab {...tabProps} />}
          {current === "assign" && <AssignTab {...tabProps} />}
          {current === "codes" && <CodesTab {...tabProps} />}
          {current === "spot" && <SpotTab {...tabProps} />}
          {current === "settings" && <SettingsTab {...tabProps} />}
        </>
      )}
    </div>
  );
}
