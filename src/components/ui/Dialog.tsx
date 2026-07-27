"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

const overlayVariants =
  "fixed inset-0 z-50 bg-ink/35 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-base";

const contentVariants = cva(
  "fixed z-50 flex flex-col bg-white shadow-overlay outline-none " +
    "data-[state=open]:animate-in data-[state=closed]:animate-out duration-slow",
  {
    variants: {
      layout: {
        center:
          "left-1/2 top-1/2 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 " +
          "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        sheet:
          "inset-y-0 right-0 ml-auto h-dvh w-full max-w-sm rounded-l-2xl p-2 pt-[calc(0.75rem+env(safe-area-inset-top))] " +
          "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        sheetBottom:
          "inset-x-0 bottom-0 w-full rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] " +
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      },
    },
    defaultVariants: { layout: "center" },
  }
);

export interface DialogContentProps
  extends VariantProps<typeof contentVariants> {
  title: string;
  titleVisuallyHidden?: boolean;
  description?: string;
  showClose?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function DialogContent({
  layout,
  title,
  titleVisuallyHidden = false,
  description,
  showClose = true,
  className,
  children,
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlayVariants} />
      <RadixDialog.Content className={cn(contentVariants({ layout }), className)}>
        <RadixDialog.Title
          className={
            titleVisuallyHidden
              ? "sr-only"
              : "text-base font-bold text-ink"
          }
        >
          {title}
        </RadixDialog.Title>
        {description && (
          <RadixDialog.Description className="mt-1 text-sm text-ink-faint">
            {description}
          </RadixDialog.Description>
        )}
        <div className={titleVisuallyHidden ? "contents" : "mt-3 flex-1 overflow-y-auto"}>
          {children}
        </div>
        {showClose && (
          <RadixDialog.Close
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-ink-faint transition hover:bg-paper-100 hover:text-ink"
          >
            <X size={20} strokeWidth={1.75} />
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
