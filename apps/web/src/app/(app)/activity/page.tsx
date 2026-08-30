import { redirect } from "next/navigation";

/** Activity merged into the Tasks page (client request 29 Aug). */
export default function ActivityPage() {
  redirect("/tasks?tab=activity");
}
