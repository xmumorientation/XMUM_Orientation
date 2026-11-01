"use client";

import { redirect } from "next/navigation";

import { useProfile } from "@/components/ProfileProvider";
import { FaciChecklist } from "@/components/freshie/FaciChecklist";

// The Facilitator's Checklist, the center tab of their tab bar.
export default function ChecklistPage() {
  const profile = useProfile();
  if (profile.role !== "faci") redirect("/dashboard");
  return <FaciChecklist />;
}
