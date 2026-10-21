import { FunfairZones } from "@/components/admin/FunfairZones";
import { PageTitle } from "@/components/ui";

// Admin → Game → Funfair (3D map): which keys power each zone of the 3D map's
// Vortexa Funfair, and the overrides. Was on Live control.
export default function AdminFunfairPage() {
  return (
    <div className="space-y-4">
      <PageTitle title="Funfair (3D map)" subtitle="Which keys light each zone, and manual overrides" />
      <FunfairZones />
    </div>
  );
}
