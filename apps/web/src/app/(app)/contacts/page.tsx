import { redirect } from "next/navigation";

/** Contacts merged into the Clients page (client request 29 Aug). */
export default function ContactsPage() {
  redirect("/companies?tab=contacts");
}
