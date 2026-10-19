import { themeFromColor } from "@/components/freshie/groupTheme";
import { cn } from "@/lib/utils";

// A group's number on a disc of the group's colour (groups.color, set in
// Admin → Freshies). The number uses the theme's onAccent, so it stays
// readable on a light colour too. Used on Ops and Scores.
export function GroupBadge({
  id,
  color,
  className,
}: {
  id: number;
  color: string | null | undefined;
  className?: string;
}) {
  const theme = themeFromColor(color);
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums",
        className
      )}
      style={{ background: theme.accent, color: theme.onAccent }}
      aria-label={`Group ${id}`}
    >
      {id}
    </span>
  );
}
