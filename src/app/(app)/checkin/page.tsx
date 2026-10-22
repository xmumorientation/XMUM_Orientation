"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Check-in on the map is now managed by Game Masters on /map.
// Any navigation to /checkin is cleanly redirected to /map.
export default function CheckinPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/map");
  }, [router]);

  return null;
}
