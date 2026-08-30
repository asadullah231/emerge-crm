import { redirect } from "next/navigation";

/** Interviews merged into the Tasks page (client request 29 Aug). */
export default function MyInterviewsPage() {
  redirect("/tasks?tab=interviews");
}
