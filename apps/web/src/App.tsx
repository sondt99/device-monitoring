import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell.js';
import { LoginPage } from './auth/LoginPage.js';
import { RequireAdmin } from './auth/RequireAdmin.js';
import { RequireAuth } from './auth/RequireAuth.js';
import { DashboardPage } from './dashboard/DashboardPage.js';
import { DevicesPanel } from './devices/DevicesPanel.js';
import { useTheme } from './lib/useTheme.js';
import { MaintenanceWindowsPanel } from './maintenance/MaintenanceWindowsPanel.js';
import { NotificationsPage } from './notifications/NotificationsPage.js';
import { StatusPage } from './status/StatusPage.js';
import { UsersPanel } from './users/UsersPanel.js';

export function App() {
  // Applies the stored/OS-preferred theme on every route, including the
  // public status page and login screen (the toggle itself lives in AppShell).
  useTheme();
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/status" element={<StatusPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="devices" element={<DevicesPanel />} />
            <Route path="devices/:id" element={<DevicesPanel />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="maintenance" element={<MaintenanceWindowsPanel />} />
            <Route element={<RequireAdmin />}>
              <Route path="settings/users" element={<UsersPanel />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
