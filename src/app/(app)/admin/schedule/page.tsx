import { redirect } from "next/navigation";

// The editor lives on /schedule. Keep this route so old links land there.
export default function AdminSchedulePage() {
  redirect("/schedule");
}
