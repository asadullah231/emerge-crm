import { redirect } from "next/navigation";

/** Activity merged into the Reports page (client request 29 Aug). */
export default function ActivityPage() {
  redirect("/reports?tab=activity");
}
