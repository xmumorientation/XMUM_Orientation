import { notFound } from "next/navigation";
import OfflineMapReference from "./OfflineMapReference";

// Local export surface only: the offline guide ships a still image, never WebGL.
export default function OfflineReferencePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OfflineMapReference />;
}
