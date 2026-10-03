"use client";

import { WelcomeSection } from "./WelcomeSection";
import { OverviewSection } from "./OverviewSection";

/**
 * Backward compatibility wrapper.
 * HomeContent is split into WelcomeSection and OverviewSection per the 8-act scroll map.
 */
export function HomeContent() {
  return (
    <>
      <WelcomeSection />
      <OverviewSection />
    </>
  );
}
