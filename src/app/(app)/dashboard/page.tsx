"use client";

import { FreshieHome } from "@/components/freshie/FreshieHome";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { useProfile } from "@/components/ProfileProvider";

export default function DashboardPage() {
  const profile = useProfile();
  return profile.role === "freshie" ? <FreshieHome /> : <StaffDashboard />;
}
