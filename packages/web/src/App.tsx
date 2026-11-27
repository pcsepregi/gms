import { NavLink, Route, Routes } from 'react-router';
import { useHealth } from './api/queries';
import { hu } from './i18n/hu';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const health = useHealth();
  return (
    <>
      <header className="app-header">
        <span className="app-title">{health.data?.appTitle ?? hu.appTitle}</span>
        <nav>
          <NavLink to="/" end>
            {hu.nav.home}
          </NavLink>
          <NavLink to="/beallitasok">{hu.nav.settings}</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/beallitasok" element={<SettingsPage />} />
        </Routes>
      </main>
    </>
  );
}
