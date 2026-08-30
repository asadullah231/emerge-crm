import { redirect } from "next/navigation";

/** Reports merged into the Tasks page (client request 29 Aug). */
export default function ReportsPage() {
  redirect("/tasks?tab=reports");
}
