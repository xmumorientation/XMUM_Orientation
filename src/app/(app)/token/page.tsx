"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { GroupScores } from "@/components/staff/game/GroupScores";
import TokenControl from "@/components/token/TokenControl";

// Staff scoreboard (read only). Facilitators do not use this page.
// The role comes from the profile the (app) layout already loaded, so a visit
// makes no server round trip to Supabase (it used to re-read the session and
// the profile on every visit). RLS still decides what each role can read.
export default function TokenPage() {
  const profile = useProfile();
  const router = useRouter();
  const isFaci = profile.role === "faci";

  useEffect(() => {
    if (isFaci) router.replace("/dashboard");
  }, [isFaci, router]);

  if (isFaci) return null;
  // HOGM and HOF: tokens and puzzle keys per group (the Scores tab).
  if (profile.role === "hogm" || profile.role === "hof") return <GroupScores />;
  // GM: the same list. A GM cannot read other groups' pieces (0002 RLS), so it
  // shows each key's piece count (fn_puzzle_status), not which pieces.
  if (profile.role === "gm") return <GroupScores countsOnly />;

  return <TokenControl scoreboardOnly />;
}
