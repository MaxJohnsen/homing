import { StrictMode, lazy, Suspense, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { routeOf } from '@/lib/router';
import { NotFound } from '@/screens/not-found';
import './styles.css';

// Each page loads only what it needs. The development server shows every screen with sample data instead.
const pages: Record<string, ComponentType> = {
  '/sign-in': lazy(() => import('@/pages/sign-in').then((page) => ({ default: page.SignInPage }))),
  '/setup': lazy(() => import('@/pages/join').then((page) => ({ default: page.JoinPage }))),
  '/join': lazy(() => import('@/pages/join').then((page) => ({ default: page.JoinPage }))),
  '/connect': lazy(() => import('@/pages/connect').then((page) => ({ default: page.ConnectPage }))),
  '/recover': lazy(() => import('@/pages/recover').then((page) => ({ default: page.RecoverPage }))),
};

// Every screen inside the app is one page, which moves between them without loading again.
const App = lazy(() => import('@/pages/app').then((page) => ({ default: page.AppPage })));

const path = location.pathname.replace(/(.)\/$/, '$1');

const Page = import.meta.env.DEV
  ? lazy(() => import('@/samples').then((samples) => ({ default: samples.Samples })))
  : routeOf(path) ? App : (pages[path] ?? NotFound);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense>
      <Page />
    </Suspense>
  </StrictMode>,
);
