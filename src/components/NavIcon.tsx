"use client";

import {
  Backpack,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  House,
  Map,
  MapPin,
  Monitor,
  Radio,
  Receipt,
  Shield,
  ShieldCheck,
  Store,
  type LucideIcon,
} from "lucide-react";

// One icon per destination, shared by the nav (AppShell) and the dashboard
// action cards so the same place always gets the same symbol (ui-icon-system:
// Lucide only, conventional metaphors, reuse across the product).
const ICONS: Record<string, LucideIcon> = {
  HM: House,
  MP: Map,
  IT: Backpack,
  TX: Receipt,
  AT: ClipboardCheck,
  CK: MapPin,
  GM: Store,
  VG: ShieldCheck,
  OP: Radio,
  PL: CalendarDays,
  FQ: CircleHelp,
  BS: Monitor,
  AD: Shield,
};

export function NavIcon({
  code,
  size = 20,
  className,
}: {
  code: string;
  size?: 16 | 20;
  className?: string;
}) {
  const Icon = ICONS[code] ?? Map;
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden />;
}
