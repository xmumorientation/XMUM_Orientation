import { notFound } from "next/navigation";
import MapPreview from "@/app/map3d/preview/MapPreview";
import { meetingDemoOpen } from "@/lib/meeting-nfc-demo";

export const dynamic = "force-dynamic";

export default function MeetingNfcMap() {
  if (!meetingDemoOpen()) notFound();
  return <>
    <p style={{ position: "fixed", top: 8, left: 0, right: 0, zIndex: 200, textAlign: "center", color: "white", fontSize: 12 }}>Meeting demo · simulated map</p>
    <MapPreview />
  </>;
}
