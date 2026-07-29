"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type DesignVariant = "classic" | "soft";

const STORAGE_KEY = "xmum-design-variant";

interface DesignVariantValue {
  variant: DesignVariant;
  setVariant: (v: DesignVariant) => void;
}

const DesignVariantContext = createContext<DesignVariantValue | null>(null);

// Lets each user pick between the shipped ("classic") screens and the
// "soft" redesign (rounded cards, one focal action, quieter alerts) on
// dashboard/map/gm/bigscreen/admin, persisted per-browser. Purely a
// presentation switch — no data or permission behaviour changes between
// variants, so pages missing a soft branch simply ignore it.
export function DesignVariantProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [variant, setVariantState] = useState<DesignVariant>("classic");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "soft" || stored === "classic") setVariantState(stored);
  }, []);

  function setVariant(v: DesignVariant) {
    setVariantState(v);
    window.localStorage.setItem(STORAGE_KEY, v);
  }

  return (
    <DesignVariantContext.Provider value={{ variant, setVariant }}>
      {children}
    </DesignVariantContext.Provider>
  );
}

export function useDesignVariant(): DesignVariantValue {
  const ctx = useContext(DesignVariantContext);
  if (!ctx) {
    // Screens outside the provider (shouldn't happen once wired at root)
    // default to classic rather than throwing, so a stray usage never 500s.
    return { variant: "classic", setVariant: () => {} };
  }
  return ctx;
}
