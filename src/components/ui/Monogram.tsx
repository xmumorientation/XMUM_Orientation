import { cn } from "@/lib/utils";
import { initialsFrom } from "@/lib/utils";

// Generalized brand mark: derives initials from the runtime-configured
// event name (Admin → Brand) instead of a hardcoded logo, since the actual
// yearly theme isn't fixed at the code level.
export function Monogram({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = {
    sm: "h-9 w-9 text-[10px]",
    md: "h-11 w-11 text-sm",
    lg: "h-14 w-14 text-base",
  }[size];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-ink font-display font-bold tracking-tight text-white shadow-raised",
        dims,
        className
      )}
      aria-hidden="true"
    >
      {initialsFrom(name)}
    </span>
  );
}
