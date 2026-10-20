import { redirect } from "next/navigation";

import { GroupScores } from "@/components/staff/game/GroupScores";
import TokenControl from "@/components/token/TokenControl";
import { supabaseServer } from "@/lib/supabase/server";

// Staff scoreboard (read only). Facilitators do not use this page.
export default async function TokenPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role === "faci") redirect("/dashboard");
  // HOGM and HOF: tokens and puzzle keys per group (the Scores tab).
  if (profile?.role === "hogm" || profile?.role === "hof") return <GroupScores />;
  // GM: the same list, tokens only. A GM cannot read other groups' pieces (0002 RLS).
  if (profile?.role === "gm") return <GroupScores tokensOnly />;

  return <TokenControl scoreboardOnly />;
}
