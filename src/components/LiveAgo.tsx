"use client";

import { useEffect, useState } from "react";

/**
 * Text that re-renders once a second with the current time, so a "last seen
 * 12s ago" line counts up live. Only this node re-renders, not the map.
 */
export function LiveText({ render }: { render: (nowMs: number) => string }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{render(nowMs)}</>;
}
