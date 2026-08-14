import { cn } from "@emerge/ui";

/**
 * Official EmergeTech logo mark: three right-leaning, rounded parallelogram bars,
 * staggered (top shifted right, middle furthest left, bottom between). Faithful
 * recreation of the approved mark - proportions and slant preserved, never
 * stretched. Colour comes from `currentColor`, so callers set it via text color
 * (navy on light surfaces, white on brand/navy surfaces).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 64"
      role="img"
      aria-label="EmergeTech"
      className={cn("h-6 w-6", className)}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinejoin="round"
    >
      <path d="M36 3 L90 3 L84 19 L30 19 Z" />
      <path d="M12 24 L66 24 L60 40 L6 40 Z" />
      <path d="M20 45 L74 45 L68 61 L14 61 Z" />
    </svg>
  );
}

/**
 * Full EmergeTech logo lockup: mark + wordmark. Used in the expanded sidebar,
 * the authentication screens, and major branding areas. The mark carries the
 * brand navy; the wordmark uses the neutral foreground so it stays legible in
 * both themes.
 */
export function LogoFull({
  className,
  markClassName,
  wordClassName
}: {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("h-7 w-7 text-[var(--brand-primary)]", markClassName)} />
      <span
        className={cn(
          "text-lg font-semibold tracking-tight text-[var(--foreground)]",
          wordClassName
        )}
      >
        EmergeTech
      </span>
    </span>
  );
}
