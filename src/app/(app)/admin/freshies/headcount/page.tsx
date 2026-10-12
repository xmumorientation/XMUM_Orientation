"use client";

import { HeadcountTable } from "@/components/admin/HeadcountTable";
import { PageTitle } from "@/components/ui";

// Always open: Admin can set, correct or clear any group's numbers at any time.
export default function HeadcountPage() {
  return (
    <div className="space-y-4">
      <PageTitle
        title="Headcount"
        subtitle="Every group's Local, International and Total headcount. Always open: click a number to set or correct it; Enter saves."
      />
      <HeadcountTable />
    </div>
  );
}
