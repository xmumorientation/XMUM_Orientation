import { BondingSessionTimer } from "@/components/BondingSessionTimer";
import { PageHeader, SectionCard } from "@/components/ui/Shared";

export default function TimerPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Timer" subtitle="Authoritative Day 1 and Day 2 session time." />
      <SectionCard>
        <BondingSessionTimer />
      </SectionCard>
    </div>
  );
}
