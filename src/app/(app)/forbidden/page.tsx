import Link from "next/link";

import { NotificationBanner, PageTitle } from "@/components/ui";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageTitle
        title="Access unavailable"
        subtitle="This page is not included in your account permissions."
      />
      <NotificationBanner
        type="ERROR"
        title="Permission required"
        message="You do not have permission to access this page. If your role or assignment recently changed, sign out and back in before contacting Admin."
      />
      <Link href="/dashboard" className="btn-primary w-full">
        Return to home
      </Link>
    </div>
  );
}
