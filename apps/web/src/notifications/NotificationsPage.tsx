import { NotificationHistory } from './NotificationHistory.js';
import { NotificationPanel } from './NotificationPanel.js';

export function NotificationsPage() {
  return (
    <section className="stack">
      <NotificationPanel />
      <NotificationHistory />
    </section>
  );
}
