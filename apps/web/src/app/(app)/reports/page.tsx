import { redirect } from "next/navigation";

/** /reports lands on the strategic overview. */
export default function ReportsIndexPage() {
  redirect("/reports/overview");
}
