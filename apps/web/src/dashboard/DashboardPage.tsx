import { RecentBeats } from './RecentBeats.js';
import { StatCards } from './StatCards.js';

export function DashboardPage() {
  return (
    <section className="stack">
      <StatCards />
      <RecentBeats />
    </section>
  );
}
