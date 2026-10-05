import { cn } from "@/lib/utils";

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

// A row of single-select filter pills. The first option is usually "All".
export function FilterChips({
  options,
  value,
  onChange,
  label,
}: {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition",
              active
                ? "bg-ink text-white"
                : "border border-paper-300 bg-white text-ink-soft hover:text-ink"
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  active ? "text-white/70" : "text-ink-faint"
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
