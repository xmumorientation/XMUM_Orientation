"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { sectionsForRole, resolveHomeSections, type HomeSection, type ResolvedHomeSection } from "@/lib/homeSections";
import { supabaseBrowser } from "@/lib/supabase/client";

/** The home sections the signed-in role should see, with links that open.
 *  Loads once, then again whenever the tab comes back so the signed links stay fresh. */
export function useHomeSections(): ResolvedHomeSection[] {
  const { role } = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sections, setSections] = useState<ResolvedHomeSection[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.from("home_sections").select("*");
      if (!active || error) return;
      const resolved = await resolveHomeSections(supabase, sectionsForRole((data as HomeSection[]) ?? [], role));
      if (active) setSections(resolved);
    }
    load();
    const again = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", again);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", again);
    };
  }, [supabase, role]);

  return sections;
}
