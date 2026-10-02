"use client";

import { LogOut } from "lucide-react";

import { useInitialGroup, useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/types";

export default function ProfilePage() {
  const profile = useProfile();
  const group = useInitialGroup();
  const rows = [
    ["Name", profile.full_name || "—"],
    ["Role", ROLE_LABELS[profile.role]],
    ["Student ID", profile.student_id || "—"],
    ["Email", profile.email || "—"],
    ["Group", group?.name || (profile.group_id ? `Group ${profile.group_id}` : "—")],
  ];

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="fd-profile">
      <h1>Profile</h1>
      <div className="fd-profile-card">
        {rows.map(([label, value]) => (
          <div key={label} className="fd-profile-row">
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <button type="button" className="fd-profile-logout" onClick={signOut}>
        <LogOut size={16} strokeWidth={1.75} aria-hidden />
        Log out
      </button>
    </div>
  );
}
