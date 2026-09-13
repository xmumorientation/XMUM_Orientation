"use client";

import type { ComponentProps, ReactNode } from "react";

import { PageTitle } from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { Button, type ButtonProps } from "@/components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export function PageHeader(props: ComponentProps<typeof PageTitle>) {
  return <PageTitle {...props} />;
}

export function PrimaryButton(props: ButtonProps) {
  return <Button intent="primary" {...props} />;
}

export function SecondaryButton(props: ButtonProps) {
  return <Button intent="secondary" {...props} />;
}

export function DangerButton(props: ButtonProps) {
  return <Button intent="danger" {...props} />;
}

export function InputBox({
  label,
  id,
  ...props
}: ComponentProps<typeof Input> & { label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <Input id={id} {...props} />
    </div>
  );
}

export function SelectBox({
  label,
  id,
  children,
  ...props
}: ComponentProps<typeof Select> & { label?: string }) {
  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <Select id={id} {...props}>{children}</Select>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card p-4 sm:p-5", className)}>
      {title && <h2 className="text-lg font-black tracking-tight">{title}</h2>}
      {description && <p className="mt-1 text-sm text-ink-faint">{description}</p>}
      <div className={cn((title || description) && "mt-4")}>{children}</div>
    </section>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        {description && <p className="mb-4 text-sm text-ink-faint">{description}</p>}
        {children}
        <DialogClose asChild>
          <SecondaryButton className="mt-4 w-full">Close</SecondaryButton>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: ComponentProps<typeof Badge>["tone"];
  children: ReactNode;
}) {
  return <Badge tone={tone}>{children}</Badge>;
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-24 w-full" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ModulePlaceholder({
  title,
  message = "Module pending",
}: {
  title: string;
  message?: string;
}) {
  return (
    <SectionCard className="min-h-52">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-1">{title}</p>
      <div className="flex min-h-36 items-center justify-center text-center">
        <p className="rounded-full border border-dashed border-paper-300 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-ink-faint">
          {message}
        </p>
      </div>
    </SectionCard>
  );
}
