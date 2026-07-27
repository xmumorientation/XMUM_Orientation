import { Check, Clock } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// The signature "verified complete" motif — evokes a passport/wristband
// station stamp. Deliberately triple-redundant (shape + color + icon/label)
// so status never relies on color alone (PRODUCT.md a11y requirement).
const stampVariants = cva(
  "inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-bold uppercase tracking-wide transition-transform",
  {
    variants: {
      state: {
        complete:
          "border-brand-1 bg-brand-1/10 text-brand-1 animate-stamp-impact",
        pending: "border-dashed border-paper-300 bg-paper-50 text-ink-muted",
      },
    },
    defaultVariants: { state: "pending" },
  }
);

export interface StampBadgeProps extends VariantProps<typeof stampVariants> {
  label: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  className?: string;
}

export function StampBadge({
  state = "pending",
  label,
  icon: Icon,
  className,
}: StampBadgeProps) {
  const FallbackIcon = state === "complete" ? Check : Clock;
  const IconComp = Icon ?? FallbackIcon;
  return (
    <span className={cn(stampVariants({ state }), className)}>
      <IconComp size={14} strokeWidth={2} />
      {label}
    </span>
  );
}
