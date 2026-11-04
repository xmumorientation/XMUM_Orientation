"use client";

import { HomeSectionsManager } from "@/components/staff/HomeSectionsManager";
import { PageTitle } from "@/components/ui";

// Admin → Settings → Home Sections: the files shown on Home to the roles Admin
// picks, including the Day 1 and Day 2 action plans.
export default function AdminHomeSectionsPage() {
  return (
    <div className="space-y-4">
      <PageTitle title="Home Sections" subtitle="Files shown on Home, and who sees them" />
      <HomeSectionsManager />
    </div>
  );
}
