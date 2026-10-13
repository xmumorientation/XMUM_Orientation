"use client";

import { FreshieHome } from "@/components/freshie/FreshieHome";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { useProfile } from "@/components/ProfileProvider";

export default function DashboardPage() {
  const profile = useProfile();
  // Freshies and Facilitators share the Vortexa scroll home; other roles get the staff dashboard.
  return profile.role === "freshie" || profile.role === "faci" ? <FreshieHome /> : <StaffDashboard />;
}
