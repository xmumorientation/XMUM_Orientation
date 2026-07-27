import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn("block animate-pulse rounded-lg bg-paper-200/80", className)}
      aria-hidden="true"
    />
  );
}
