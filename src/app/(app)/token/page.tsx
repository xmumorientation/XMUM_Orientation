import { redirect } from "next/navigation";

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

  return <TokenControl scoreboardOnly />;
}
