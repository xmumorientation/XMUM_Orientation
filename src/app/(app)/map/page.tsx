"use client";

import { useDesignVariant } from "@/components/DesignVariantProvider";
import { CampusMap } from "@/components/CampusMap";
import { useProfile } from "@/components/ProfileProvider";
import { PageTitle } from "@/components/ui";
import { COMMITTEE_TIER } from "@/lib/types";

export default function MapPage() {
  const profile = useProfile();
  const { variant } = useDesignVariant();
  // D-1: committee sees all group pins; Faci sees own group only (the RPC
  // enforces this server-side - the flag just requests pins).
  const showPins =
    COMMITTEE_TIER.includes(profile.role) || profile.role === "faci";

  if (variant === "soft") {
    return (
      <div className="space-y-3">
        <div className="px-1">
          <p className="text-lg font-semibold text-ink">Campus map</p>
          <p className="text-sm text-ink-faint">
            Available, in progress, and closed stations. Tap a station for
            details.
          </p>
        </div>
        <CampusMap showGroupPins={showPins} soft />
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Campus map"
        subtitle="Available, in progress, and closed stations. Tap a station for details."
      />
      <CampusMap showGroupPins={showPins} />
    </div>
  );
}
