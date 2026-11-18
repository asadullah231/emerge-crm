import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /bd ab team ke external outreach dashboard pe hand-off karta hai (Asad,
 * 18 Nov 2026) - wahi ek jagah hai jahan team kaam karti hai. Module ke
 * subpages aur src/bd ka data layer jaan ke rakhe hue hain: CRM dashboard ki
 * BD strip aur MCP ka bdSnapshot wahin se parhte hain, aur purana overview
 * git history me mojood hai agar kabhi wapas chahiye ho.
 */
export default function BdRedirect() {
  redirect("https://bd.187-127-75-106.sslip.io/dashboard");
}
