import type { ReactNode } from 'react';

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
