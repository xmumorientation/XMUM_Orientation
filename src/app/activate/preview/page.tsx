import { VictoryTakeover } from "@/components/VictoryTakeover";
import { notFound } from "next/navigation";
import { DEFAULT_ZONE_KEYS, FUNFAIR_ZONES } from "@/lib/funfair";
import type { ProjectorLocation } from "@/lib/types";

/** Local-only visual harness. Never redeems a card or calls Supabase. */
export default async function ActivationPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { location: requested } = await searchParams;
  const valid: ProjectorLocation[] = ["B1", "A3", "TF"];
  const location = valid.includes(requested as ProjectorLocation)
    ? (requested as ProjectorLocation)
    : "A3";

  return (
    <>
      <VictoryTakeover location={location} groupName="Group 9" replayZones={FUNFAIR_ZONES.filter(zone => DEFAULT_ZONE_KEYS[zone] === location)} mapHref="/map3d/preview" />
      <nav className="fixed bottom-6 left-1/2 z-[110] flex -translate-x-1/2 gap-2 rounded-full border border-white/20 bg-black/40 p-1.5 text-xs font-semibold text-white/80 backdrop-blur" aria-label="Preview projector location">
        {valid.map((item) => (
          <a key={item} href={`/activate/preview?location=${item}`} aria-current={item === location ? "page" : undefined} className={`rounded-full px-3 py-2 ${item === location ? "bg-white/20 text-white" : "text-white/65"}`}>
            {item}
          </a>
        ))}
        <span className="self-center px-2 text-white/45">Preview only</span>
      </nav>
    </>
  );
}
