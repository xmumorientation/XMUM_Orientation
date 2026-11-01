import { redirect } from "next/navigation";

// The group code moved to Faci Home (GroupCodeStop); old links land there.
export default function GroupCodePage() {
  redirect("/dashboard#fh-code");
}
