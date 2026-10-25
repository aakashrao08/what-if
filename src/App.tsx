import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PrefsProvider } from './state/prefs';
import { MatchProvider } from './state/match';
import { I18nProvider } from './state/i18n';
import { Header, Loading, ScreenBoundary, SkipLink } from './ui/kit';
import Home from './screens/Home';
// every screen but Home loads when it's first visited, so the first page arrives sooner
const Swing = lazy(() => import('./screens/Swing'));
const Ghost = lazy(() => import('./screens/Ghost'));
const Ripple = lazy(() => import('./screens/Ripple'));
const Multiverse = lazy(() => import('./screens/Multiverse'));
const SettleIt = lazy(() => import('./screens/SettleIt'));
const Dugout = lazy(() => import('./screens/Dugout'));
const CurrentAffairs = lazy(() => import('./screens/CurrentAffairs'));
const Squad = lazy(() => import('./screens/Squad'));

const TITLES: Record<string, string> = {
  '/': 'What If? · Same match. Different ending.',
  '/swing': 'The Swing · What If?',
  '/ghost': 'Ghost Run · What If?',
  '/ripple': 'Ripple · What If?',
  '/multiverse': 'Multiverse · What If?',
  '/settle': 'Settle It · What If?',
  '/dugout': 'My Dugout · What If?',
  '/league': 'Current Affairs · What If?'
};

function Shell() {
  const { pathname } = useLocation();
  useEffect(() => {
    const squad = pathname.match(/^\/league\/(\w+)/)?.[1];
    document.title = squad ? `${squad.toUpperCase()} squad · What If?` : TITLES[pathname] ?? TITLES['/'];
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="page">
      <SkipLink />
      <Header />
      <main id="main" tabIndex={-1} style={{ outline: 'none', display: 'contents' }}>
      <ScreenBoundary resetKey={pathname}>
      <Suspense fallback={<Loading>Loading…</Loading>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/swing" element={<Swing />} />
        <Route path="/ghost" element={<Ghost />} />
        <Route path="/ghost/:id" element={<Ghost />} />
        <Route path="/ripple" element={<Ripple />} />
        <Route path="/multiverse" element={<Multiverse />} />
        <Route path="/settle" element={<SettleIt />} />
        <Route path="/dugout" element={<Dugout />} />
        <Route path="/league" element={<CurrentAffairs />} />
        <Route path="/league/:code" element={<Squad />} />
        <Route path="*" element={<Home />} />
      </Routes>
      </Suspense>
      </ScreenBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <I18nProvider>
      <MatchProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </MatchProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}
