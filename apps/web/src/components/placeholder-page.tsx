export function PlaceholderPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-[var(--muted)]">Coming in {milestone}.</p>
    </div>
  );
}
