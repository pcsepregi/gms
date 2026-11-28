import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { useHealth } from './api/queries';
import { useBackupStatus } from './api/backup';
import { ToastProvider } from './components/Toasts';
import { hu } from './i18n/hu';
import { CardsPage } from './pages/CardsPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { ThemeSwitch } from './theme';

export function App() {
  const health = useHealth();
  const backup = useBackupStatus();
  const warn = backup.data?.configured && backup.data.stale;
  const title = health.data?.appTitle ?? hu.appTitle;
  // A böngészőfül címe is a beállított alkalmazásnév.
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <ToastProvider>
      {warn && (
        <div className="backup-warning" role="alert">
          <span>
            {backup.data!.lastStatus === 'error' ? hu.backup.warningError : hu.backup.warningOld}
          </span>
          <NavLink to="/beallitasok">{hu.backup.details}</NavLink>
        </div>
      )}
      <header className="app-header">
        <span className="app-title">{title}</span>
        <nav>
          <NavLink to="/" end>
            {hu.nav.home}
          </NavLink>
          <NavLink to="/kartyak">{hu.nav.cards}</NavLink>
          <NavLink to="/beallitasok">{hu.nav.settings}</NavLink>
        </nav>
        <div className="header-end">
          <ThemeSwitch />
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/kartyak" element={<CardsPage />} />
          <Route path="/kartyak/uj" element={<CardsPage creating />} />
          <Route path="/kartyak/:id" element={<CardsPage />} />
          <Route path="/beallitasok" element={<SettingsPage />} />
        </Routes>
      </main>
    </ToastProvider>
  );
}
