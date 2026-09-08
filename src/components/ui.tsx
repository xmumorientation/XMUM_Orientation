"use client";

import { cn } from "@/lib/utils";
import type { StationStatus } from "@/lib/types";
import { Badge, Monogram } from "@/components/ui/index";

export * from "@/components/ui/index";

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
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          {title}
        </h1>
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

export function EmptyState({
  message,
  title = "Nothing here yet",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <Monogram name={title} size="sm" />
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
    <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
      {message}
    </div>
  );
}

export function NotificationBanner({
  type,
  title,
  message,
}: {
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  title: string;
  message: string;
}) {
  const tone = type === "ERROR"
    ? "border-red-200 bg-red-50 text-red-900"
    : type === "WARNING"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : type === "SUCCESS"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-blue-200 bg-blue-50 text-blue-900";
  return (
    <div role={type === "ERROR" ? "alert" : "status"} className={`rounded-2xl border p-4 ${tone}`}>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm leading-5">{message}</p>
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
  return <Badge tone={tone}>{children}</Badge>;
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
