export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" aria-live="polite">
      <span className="skeleton skeleton-wide" />
      <span className="skeleton" />
      <span>{label}</span>
    </div>
  );
}
