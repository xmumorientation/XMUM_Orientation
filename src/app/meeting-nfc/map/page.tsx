import { notFound } from "next/navigation";
import MapPreview from "@/app/map3d/preview/MapPreview";
import { meetingDemoOpen } from "@/lib/meeting-nfc-demo";

export const dynamic = "force-dynamic";

export default function MeetingNfcMap() {
  if (!meetingDemoOpen()) notFound();
  return <MapPreview meeting />;
}
