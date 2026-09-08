import { EmptyState, PageTitle } from "@/components/ui";

export default function LightingPage() {
  return (
    <div className="space-y-4">
      <PageTitle
        title="Lighting Zone"
        subtitle="Lighting progress, NFC scanning, and activation status"
      />
      <EmptyState
        title="Lighting Zone is being prepared"
        message="Your account permission is ready. The full Lighting Zone workflow and effects will be implemented in its dedicated section."
      />
    </div>
  );
}
