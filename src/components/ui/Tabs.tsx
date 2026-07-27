"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const Tabs = RadixTabs.Root;

const listVariants = cva("flex gap-1", {
  variants: {
    variant: {
      pill: "rounded-full border border-paper-300 bg-paper-100 p-1",
      console:
        "sticky top-0 z-10 -mx-3 overflow-x-auto border-b border-paper-300 bg-white/95 px-3 backdrop-blur sm:mx-0 sm:rounded-none sm:px-0",
    },
  },
  defaultVariants: { variant: "pill" },
});

const triggerVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap px-4 text-sm font-semibold text-ink-faint transition-colors duration-base " +
    "data-[state=active]:text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-brand-1/45 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        pill: "rounded-full data-[state=active]:bg-white data-[state=active]:shadow-raised",
        console:
          "border-b-2 border-transparent font-mono data-[state=active]:border-brand-1",
      },
    },
    defaultVariants: { variant: "pill" },
  }
);

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof RadixTabs.List>,
    VariantProps<typeof listVariants> {}

export function TabsList({ variant, className, ...props }: TabsListProps) {
  return (
    <RadixTabs.List
      className={cn(listVariants({ variant }), className)}
      {...props}
    />
  );
}

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>,
    VariantProps<typeof triggerVariants> {}

export function TabsTrigger({
  variant,
  className,
  ...props
}: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(triggerVariants({ variant }), className)}
      {...props}
    />
  );
}

export const TabsContent = RadixTabs.Content;
