"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AssignTab } from "@/components/admin/blindbox/AssignTab";
import { SellersTab } from "@/components/admin/blindbox/SellersTab";
import { SettingsTab } from "@/components/admin/blindbox/SettingsTab";
import { TypesTab } from "@/components/admin/blindbox/TypesTab";
import { useBlindBoxAdmin } from "@/components/admin/blindbox/useBlindBoxAdmin";
import { BlindBoxCard } from "@/components/BlindBoxCard";
import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { cn } from "@/lib/utils";

type Tab = "sellers" | "types" | "assign" | "settings";

const TABS: [Tab, string][] = [
  ["sellers", "Sellers & codes"],
  ["types", "Box types"],
  ["assign", "Assign"],
  ["settings", "Settings"],
];

// Admin blind-box management, all in one place:
//   Box types      create / edit / delete types (range, price, stock)
//   Assign         give a type to an account, a role (bulk), or stations
//   Sellers & codes who holds what, how many opened, each code + its link
//   Settings       how many boxes one group can open in total
// Freshies scan a seller's QR, see a confirm screen, and tap Open: only then
// is the price paid and one box deducted.
export default function AdminBlindBoxPage() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sellers");
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

  const stats: [string, number | string, string?][] = [
    ["In stock", o.stock],
    ["Assigned", o.assigned],
    ["Unassigned", o.unassigned, o.unassigned === 0 && o.stock > 0 ? "text-ink-faint" : undefined],
    ["Opened (sold)", o.opened],
    ["Left with sellers", o.left],
    ["Tokens paid in", o.tokensIn],
    ["Tokens paid out", o.tokensOut],
    ["Groups at cap", o.groupsAtCap],
  ];

  const tabProps = { data, onError, onNotice };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Blind boxes"
        subtitle="Create box types, hand them to accounts and stations, and watch them sell"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {stats.map(([label, value, tone]) => (
          <Card key={label} className="p-3 text-center">
            <p className={cn("text-xl font-bold tabular-nums", tone)}>{value}</p>
            <p className="text-xs text-ink-faint">{label}</p>
          </Card>
        ))}
      </div>
      <p className="-mt-2 text-xs text-ink-faint">
        Paid in = tokens groups spent on boxes; paid out = tokens they won.
        Cap: {data.cap} boxes per group, one per seller.
      </p>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-paper-200">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold",
              tab === key
                ? "border-ink text-ink"
                : "border-transparent text-ink-faint hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!data.loaded ? (
        <p className="py-8 text-center text-sm text-ink-faint">Loading…</p>
      ) : (
        <>
          {tab === "sellers" && <SellersTab {...tabProps} />}
          {tab === "types" && <TypesTab {...tabProps} />}
          {tab === "assign" && <AssignTab {...tabProps} />}
          {tab === "settings" && <SettingsTab {...tabProps} />}
        </>
      )}

      {/* Shows only if this admin holds boxes themselves. */}
      <BlindBoxCard />
    </div>
  );
}
