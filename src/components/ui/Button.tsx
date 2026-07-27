"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

// NFR-5: 44px min touch target — never reduce min-h below that, even on the
// dense "console" intent used in admin/ops screens. Density comes from
// padding/font-size only.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold " +
    "transition-[transform,background-color,box-shadow] duration-base ease-snappy " +
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 " +
    "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-1/45 focus-visible:outline-offset-2",
  {
    variants: {
      intent: {
        primary:
          "text-white shadow-raised bg-[image:linear-gradient(90deg,theme(colors.brand.1),theme(colors.brand.2))]",
        secondary:
          "border border-paper-300 bg-white text-ink hover:-translate-y-0.5 hover:border-brand-1/50 hover:bg-brand-1/5",
        danger: "bg-status-busy text-white shadow-raised",
        ghost: "text-ink-soft hover:bg-paper-100 hover:text-ink",
        console:
          "border border-paper-300 bg-white font-mono text-ink hover:bg-paper-100",
      },
      size: {
        sm: "min-h-[44px] rounded-md px-3 text-sm",
        md: "min-h-[44px] rounded-full px-5 text-base",
        lg: "min-h-[52px] rounded-full px-6 text-base",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: { intent: "primary", size: "md", fullWidth: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      intent,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      icon: Icon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref as never}
        className={cn(buttonVariants({ intent, size, fullWidth }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <Spinner className="h-4 w-4" />
        ) : Icon ? (
          <Icon size={20} strokeWidth={1.75} />
        ) : null}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";
