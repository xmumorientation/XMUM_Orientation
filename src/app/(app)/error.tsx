"use client";

import { usePathname } from "next/navigation";
import { saveAdminDayFilter } from "@/lib/adminDayFilter";
import { useEffect } from "react";

import { Card } from "@/components/ui";

// Error boundary scoped to the authenticated app segment: keeps the shell
// (sidebar/nav) intact and recovers just the page content.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-xs font-black tracking-tight text-red-700">
        VX
      </span>
      <p className="font-semibold">This screen ran into a problem</p>
      <p className="max-w-[32ch] text-sm leading-5 text-ink-faint">
        Try again — the rest of the app is still running.
      </p>
      <button onClick={reset} className="btn-primary mt-3">
        Try again
      </button>
      {pathname === "/admin" && <button className="btn-secondary min-h-[44px]" onClick={() => {
        saveAdminDayFilter("Day 1");
        window.location.assign("/admin");
      }}>Reopen Live control on Day 1</button>}
    </Card>
  );
}
