import {
  Activity,
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  Clock,
  Coins,
  Gamepad2,
  HelpCircle,
  History,
  Home,
  Map,
  Monitor,
  Navigation,
  Package,
  ShieldCheck,
  Sliders,
  UserCheck,
  type LucideProps,
} from "lucide-react";

export type NavIconCode =
  | "HM"
  | "MP"
  | "IT"
  | "TX"
  | "AT"
  | "CK"
  | "GM"
  | "TK"
  | "VG"
  | "OP"
  | "BS"
  | "AD"
  | "PL"
  | "FQ"
  | "BK"
  | "RS"
  | "RC";

interface NavIconProps extends Omit<LucideProps, "ref"> {
  code: NavIconCode | string;
}

export function NavIcon({
  code,
  size = 20,
  strokeWidth = 1.75,
  ...props
}: NavIconProps) {
  const iconProps = { size, strokeWidth, ...props };

  switch (code) {
    case "HM":
      return <Home {...iconProps} />;
    case "MP":
      return <Map {...iconProps} />;
    case "IT":
      return <Package {...iconProps} />;
    case "TX":
      return <History {...iconProps} />;
    case "AT":
      return <ClipboardCheck {...iconProps} />;
    case "CK":
      return <Navigation {...iconProps} />;
    case "GM":
      return <Gamepad2 {...iconProps} />;
    case "TK":
      return <Coins {...iconProps} />;
    case "VG":
      return <ShieldCheck {...iconProps} />;
    case "OP":
      return <Activity {...iconProps} />;
    case "BS":
      return <Monitor {...iconProps} />;
    case "AD":
      return <Sliders {...iconProps} />;
    case "PL":
      return <Calendar {...iconProps} />;
    case "FQ":
      return <HelpCircle {...iconProps} />;
    case "BK":
      return <CalendarCheck {...iconProps} />;
    case "RS":
      return <Clock {...iconProps} />;
    case "RC":
      return <UserCheck {...iconProps} />;
    default:
      return <Home {...iconProps} />;
  }
}
