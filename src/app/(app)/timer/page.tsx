import { PhaseTimer } from "@/components/PhaseTimer";
import { PageHeader, SectionCard } from "@/components/ui/Shared";

export default function TimerPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Timer" subtitle="Current orientation session time." />
      <SectionCard>
        <PhaseTimer />
      </SectionCard>
    </div>
  );
}
