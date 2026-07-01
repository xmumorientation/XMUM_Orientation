"use client";

import { cn } from "@/lib/utils";
import type { StationStatus } from "@/lib/types";

export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
      <div className="starlight-rule mt-2 w-16" />
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

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <span className="text-3xl">✨</span>
      <p className="text-sm text-ink-faint">{message}</p>
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
