import { NavLink, Route, Routes } from 'react-router';
import { useHealth } from './api/queries';
import { ToastProvider } from './components/Toasts';
import { hu } from './i18n/hu';
import { CardsPage } from './pages/CardsPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { ThemeSwitch } from './theme';

export function App() {
  const health = useHealth();
  return (
    <ToastProvider>
      <header className="app-header">
        <span className="app-title">{health.data?.appTitle ?? hu.appTitle}</span>
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
          <Route path="/kartyak/:id" element={<CardsPage />} />
          <Route path="/beallitasok" element={<SettingsPage />} />
        </Routes>
      </main>
    </ToastProvider>
  );
}
