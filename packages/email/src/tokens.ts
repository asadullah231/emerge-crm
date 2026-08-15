/**
 * Design tokens for the transactional email system. Values are literal (email
 * cannot use CSS variables) and sampled from the app's light-theme brand tokens
 * in apps/web/src/app/globals.css so mail matches the product.
 *
 * Two brand colours only: navy (primary) + teal (accent), per the brand rules.
 */
export const brand = {
  navy: "#0b2149",
  navyStrong: "#060f2e",
  navyHover: "#14315f",
  navySoft: "#eef1f8",
  teal: "#0c7c71",
  tealHover: "#0a655c",
  tealSoft: "#e1f4f0",
  white: "#ffffff",
  /** Page background behind the card — a soft cool grey. */
  pageBg: "#eef0f4",
  card: "#ffffff",
  border: "#e4e7ec",
  borderStrong: "#d7dbe3",
  text: "#1a1a1f",
  textMuted: "#5b5b66",
  textSubtle: "#8a8a94"
} as const;

/** Web-safe stack with system UI fonts first (no web fonts in email). */
export const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

/** The product/company identity shown in every email. */
export const company = {
  product: "Emerge CRM",
  domain: "emergeautomation.tech",
  siteUrl: "https://emergeautomation.tech"
} as const;

/** Fixed content width — the safe, universally-supported email column. */
export const CONTENT_WIDTH = 600;
