"use client";

import { useEffect, useState } from "react";

/**
 * Branded loading splash, shown briefly on a full page load (initial entry or
 * refresh), the way Zoho Recruit shows its splash. It does NOT reappear on
 * in-app tab navigation: this client component mounts once per full page load
 * (client-side route changes keep the app layout, and this, mounted), so a hard
 * load is the only trigger. It fades out on its own after the animation reads.
 */
export function AppSplash() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");

  useEffect(() => {
    const toFade = setTimeout(() => setPhase("fade"), 850);
    const toGone = setTimeout(() => setPhase("gone"), 1400);
    return () => {
      clearTimeout(toFade);
      clearTimeout(toGone);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 transition-opacity duration-500 ${
        phase === "fade" ? "opacity-0" : "opacity-100"
      }`}
      style={{ backgroundColor: "#0b2149" }}
    >
      <svg
        width="140"
        height="94"
        viewBox="0 0 96 64"
        fill="#ffffff"
        role="img"
        aria-label="EmergeTech"
      >
        <path className="emerge-splash-bar" style={{ animationDelay: "0ms" }} d="M36 3 L90 3 L84 19 L30 19 Z" />
        <path className="emerge-splash-bar" style={{ animationDelay: "160ms" }} d="M12 24 L66 24 L60 40 L6 40 Z" />
        <path className="emerge-splash-bar" style={{ animationDelay: "320ms" }} d="M20 45 L74 45 L68 61 L14 61 Z" />
      </svg>
      <div className="emerge-splash-word text-2xl font-bold tracking-tight">
        <span style={{ color: "#ffffff" }}>Emerge</span>
        <span style={{ color: "#2fbba6" }}>Tech</span>
      </div>
    </div>
  );
}
