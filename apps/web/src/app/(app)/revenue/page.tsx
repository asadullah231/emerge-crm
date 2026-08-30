import { redirect } from "next/navigation";

/**
 * The Revenue page is hidden for now (client request 29 Aug). The revenue
 * router and the per-job revenue panel stay live; to bring the page back,
 * restore this file from git history (v0.26.0) and re-add the nav item in
 * the app layout.
 */
export default function RevenuePage() {
  redirect("/dashboard");
}
