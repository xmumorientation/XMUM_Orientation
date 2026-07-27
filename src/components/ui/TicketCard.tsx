import { cn } from "@/lib/utils";

// Torn-edge ticket-stub shape for the Auth zone — evokes claiming a physical
// event ticket rather than a generic SaaS card. The notches are pure CSS
// (radial-gradient mask), no image assets, so they follow paper-50 in any
// theme. Wraps the existing .auth-card/.auth-card-inner classes rather than
// replacing them, so this is additive, not a rename.
export function TicketCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("auth-card relative", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-0 -translate-x-1/2 border-l-2 border-dashed border-paper-300/80 sm:block"
      />
      <div className="auth-card-inner">{children}</div>
    </div>
  );
}
