"use client";

import { createContext, useContext } from "react";

const ShellMenuContext = createContext<(() => void) | null>(null);

export function ShellMenuProvider({
  openMenu,
  children,
}: {
  openMenu: () => void;
  children: React.ReactNode;
}) {
  return <ShellMenuContext.Provider value={openMenu}>{children}</ShellMenuContext.Provider>;
}

export function useOpenShellMenu() {
  return useContext(ShellMenuContext);
}
