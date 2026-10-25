import { redirect } from "next/navigation";

// The Funfair (3D map) card is now a tab of Live control → Game master.
export default function AdminFunfairPage() {
  redirect("/admin");
}
