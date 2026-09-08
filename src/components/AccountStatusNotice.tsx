"use client";

import { useCurrentUserContext } from "@/components/ProfileProvider";
import { NotificationBanner } from "@/components/ui";

export function AccountStatusNotice() {
  const context = useCurrentUserContext();

  if (
    context.role === "faci" &&
    context.groupId === null
  ) {
    return (
      <NotificationBanner
        type="WARNING"
        title="Group assignment pending"
        message="Your group has not been assigned yet. You can still use account-level pages; group resources will become available after allocation."
      />
    );
  }

  if (context.role === "gm" && context.day && context.stationId === null) {
    return (
      <NotificationBanner
        type="WARNING"
        title={`Day ${context.day} station pending`}
        message="Your station assignment has not been configured yet. Contact Admin before starting gameplay actions."
      />
    );
  }

  return null;
}
