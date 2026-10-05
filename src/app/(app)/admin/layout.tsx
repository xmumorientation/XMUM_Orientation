import { useCurrentUserContext } from "@/components/ProfileProvider";
import { hasPermission } from "@/lib/permissions";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = useCurrentUserContext();

  if (!hasPermission(context.permissions, "admin.access") && !hasPermission(context.permissions, "management.access")) {
    return (
      <p className="py-16 text-center text-sm text-ink-faint">
        Admin access required.
      </p>
    );
  }

  return <div className="min-w-0">{children}</div>;
}
