import { redirect } from "next/navigation";

import TokenControl from "../admin/token/page";
import { supabaseServer } from "@/lib/supabase/server";

// Staff token control. Facilitators do not use this page.
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

  return <TokenControl />;
}
