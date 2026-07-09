"use client";

import { cn } from "@/lib/utils";
import type { StationStatus } from "@/lib/types";

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-1 max-w-[42ch] text-sm leading-5 text-ink-faint">
            {subtitle}
          </p>
        )}
        <div className="starlight-rule mt-3 w-16" />
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("card p-4", className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-base-300 border-t-star-cyan",
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block animate-pulse rounded-xl bg-base-200/80",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  message,
  title = "Nothing here yet",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-star-cyansoft/20 text-xs font-black tracking-tight text-star-cyanstrong">
        VX
      </span>
      <p className="font-semibold">{title}</p>
      <p className="max-w-[28ch] text-sm leading-5 text-ink-faint">
        {message}
      </p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
      {message}
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "info" | "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-star-cyan/30 bg-star-cyansoft/20 text-star-cyanstrong",
    success: "border-green-200 bg-green-50 text-green-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    neutral: "border-base-300 bg-white text-ink-soft",
  }[tone];

  return (
    <span className={cn("chip border", styles)}>
      {children}
    </span>
  );
}

const STATION_STATUS_META: Record<
  StationStatus,
  { label: string; dot: string; chip: string }
> = {
  available: {
    label: "Available",
    dot: "bg-status-open",
    chip: "bg-green-100 text-green-800",
  },
  in_progress: {
    label: "In Progress",
    dot: "bg-status-busy",
    chip: "bg-red-100 text-red-800",
  },
  closed: {
    label: "Closed",
    dot: "bg-status-closed",
    chip: "bg-gray-200 text-gray-700",
  },
};

export function StationStatusChip({ status }: { status: StationStatus }) {
  const meta = STATION_STATUS_META[status];
  return (
    <span className={cn("chip", meta.chip)}>
      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function stationDotColor(status: StationStatus): string {
  return status === "available"
    ? "#16a34a"
    : status === "in_progress"
      ? "#dc2626"
      : "#9ca3af";
}
