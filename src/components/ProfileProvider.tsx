"use client";

import { createContext, useContext } from "react";

import type { Group, Profile } from "@/lib/types";

const ProfileContext = createContext<Profile | null>(null);
const InitialGroupContext = createContext<Group | null>(null);

export function ProfileProvider({
  profile,
  initialGroup = null,
  children,
}: {
  profile: Profile;
  initialGroup?: Group | null;
  children: React.ReactNode;
}) {
  return (
    <ProfileContext.Provider value={profile}>
      <InitialGroupContext.Provider value={initialGroup}>
        {children}
      </InitialGroupContext.Provider>
    </ProfileContext.Provider>
  );
}

export function useProfile(): Profile {
  const p = useContext(ProfileContext);
  if (!p) throw new Error("useProfile must be used inside ProfileProvider");
  return p;
}

// Group snapshot fetched server-side alongside the profile, so pages can
// render group data on first paint. useGroup keeps it live afterwards.
export function useInitialGroup(): Group | null {
  return useContext(InitialGroupContext);
}
