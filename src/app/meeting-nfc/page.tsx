import { notFound } from "next/navigation";
import { VictoryTakeover } from "@/components/VictoryTakeover";
import { DEFAULT_ZONE_KEYS, FUNFAIR_ZONES } from "@/lib/funfair";
import { meetingDemoOpen } from "@/lib/meeting-nfc-demo";
import { DEFAULT_PLACES } from "@/lib/projectorPlaces";

export const dynamic = "force-dynamic";

export default function MeetingNfcDemo() {
  if (!meetingDemoOpen()) notFound();
  return <>
    <VictoryTakeover place={DEFAULT_PLACES.A3.name} groupName={null} replayZones={FUNFAIR_ZONES.filter(zone => DEFAULT_ZONE_KEYS[zone] === "A3")} mapHref="/meeting-nfc/map" />
    <p style={{ position: "fixed", bottom: 8, left: 0, right: 0, zIndex: 200, textAlign: "center", color: "white", fontSize: 12 }}>Meeting demo, simulated result</p>
  </>;
}
