/**
 * Offer + placement presentation helpers shared by the offer panel, revenue
 * panels and the revenue page. Pure data + formatting, no imports.
 */

export const OFFER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired"
};

export const OFFER_STATUS_STYLE: Record<string, string> = {
  draft: "bg-zinc-500/10 text-[var(--muted)]",
  sent: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
  accepted: "bg-green-500/10 text-green-600",
  declined: "bg-red-500/10 text-red-600",
  withdrawn: "bg-red-500/10 text-red-600",
  expired: "bg-amber-500/10 text-amber-600"
};

export const OFFER_MEDIUM_OPTIONS = [
  { value: "link", label: "Share link" },
  { value: "email", label: "Email" },
  { value: "portal", label: "Portal" },
  { value: "other", label: "Other" }
] as const;

/** Format whole-currency-unit amounts, e.g. 8500 GBP -> "£8,500". */
export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null) return "-";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency ? currency + " " : ""}${amount.toLocaleString()}`;
  }
}

/**
 * Human countdown to an expiry timestamp. Returns null when there is no expiry.
 * Past expiry reads "Expired"; otherwise "3 days left" / "5 hours left".
 */
export function expiryCountdown(expiresAt: string | Date | null | undefined): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `${hours} hour${hours === 1 ? "" : "s"} left`;
}
