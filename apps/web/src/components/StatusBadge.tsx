import { statusTone } from '../lib/format.js';

export function StatusBadge({ status }: { status: string }) {
  const meta = statusTone[status] ?? { label: status, hint: status };
  return (
    <span className={`badge badge-${status}`} title={meta.hint}>
      <span className="badge-dot" />
      {meta.label}
    </span>
  );
}
