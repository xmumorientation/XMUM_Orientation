"use client";

import { HeadcountTable } from "@/components/admin/HeadcountTable";
import { LocationOptionsManager } from "@/components/admin/LocationOptionsManager";
import { LocationTable } from "@/components/admin/LocationTable";
import { PageTitle } from "@/components/ui";

// Two tables, one row per group (Group 1 to 10) in each:
//   Headcount  always open: Admin can set, correct or clear any group's numbers.
//   Location   the group's manual location update, which any Facilitator in the
//              group can send; Admin corrects the latest one. Admin also
//              manages the location options (A1, A3, ...) Facilitators choose from.
// Tables from md up, cards on a phone.
export default function HeadcountAndLocationPage() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Headcount and location"
        subtitle="How many people each group has, and where its Facilitators say the group is."
      />

      <section className="space-y-3" aria-labelledby="hc-title">
        <div>
          <h2 id="hc-title" className="text-lg font-bold">
            Headcount
          </h2>
          <p className="text-sm text-ink-faint">Tap a number to set or correct it. Enter or leaving the box saves.</p>
        </div>
        <HeadcountTable />
      </section>

      <section className="space-y-3" aria-labelledby="loc-title">
        <div>
          <h2 id="loc-title" className="text-lg font-bold">
            Location
          </h2>
          <p className="text-sm text-ink-faint">
            Any Facilitator in a group sends its location, and the group shares the latest. Change the status or location to correct it.
          </p>
        </div>
        <LocationTable />
        <LocationOptionsManager />
      </section>
    </div>
  );
}
