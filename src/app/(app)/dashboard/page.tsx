"use client";

import { FreshieHome } from "@/components/freshie/FreshieHome";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { StaffHome } from "@/components/staff/StaffHome";
import { useProfile } from "@/components/ProfileProvider";
import { OPS_ROLES } from "@/lib/types";

export default function DashboardPage() {
  const profile = useProfile();
  // Freshies and Facilitators share the Vortexa scroll home; HOF, HOGM and
  // Committee get the same layout in the Welcome page colours; other roles
  // get the staff dashboard.
  if (profile.role === "freshie" || profile.role === "faci") return <FreshieHome />;
  if (OPS_ROLES.includes(profile.role)) return <StaffHome />;
  return <StaffDashboard />;
}
