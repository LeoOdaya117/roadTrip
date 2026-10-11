import { lazy, Suspense, useContext, useEffect, type ReactNode } from 'react';
import { Redirect, Route, type RouteComponentProps } from 'react-router-dom';
import {
  IonApp,
  IonRouterOutlet,
  IonSpinner,
  RouteManagerContext,
  setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import ThemeProvider from './context/ThemeProvider';
import AppNavigation from './components/AppNavigation';
import { createIonicBrowserHistory } from './navigation/createIonicBrowserHistory';

const HomePage = lazy(() => import('./pages/HomePage'));
const RideLobbyPage = lazy(() => import('./pages/RideLobbyPage'));
const RideMapPage = lazy(() => import('./pages/RideMapPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const RideHistoryPage = lazy(() => import('./pages/RideHistoryPage'));
const RideReplayPage = lazy(() => import('./pages/RideReplayPage'));
const RideHistoryStatsPage = lazy(() => import('./pages/RideHistoryStatsPage'));
const ShareImagePage = lazy(() => import('./pages/ShareImagePage'));

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.system.css';
import './theme/variables.css';
import './App.css';
import './styles/crew-board.css';

setupIonicReact();

const appHistory = createIonicBrowserHistory();

function BrowserForwardRestorer() {
  const routeManager = useContext(RouteManagerContext);

  useEffect(() => {
    const discardStaleForwardView = (event: Event) => {
      const { path } = (event as CustomEvent<{ path: string }>).detail;
      const pathname = new URL(path, window.location.origin).pathname;
      const staleView = routeManager.findViewItemByPathname(pathname);
      if (staleView) routeManager.unMountViewItem(staleView);
    };
    window.addEventListener('roadtrip:history-forward', discardStaleForwardView);
    return () => window.removeEventListener('roadtrip:history-forward', discardStaleForwardView);
  }, [routeManager]);

  return null;
}

function RouteLoadingOverlay() {
  return (
    <div className="route-loading-overlay">
      <div className="route-loading-state" role="status" aria-live="polite">
        <IonSpinner name="crescent" aria-hidden="true" />
        <span>Loading page…</span>
      </div>
    </div>
  );
}

const withRouteLoading = (page: ReactNode) => (
  <Suspense fallback={<RouteLoadingOverlay />}>{page}</Suspense>
);

const App: React.FC = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setOverlaysWebView({ overlay: true });
    void StatusBar.setStyle({ style: Style.Dark });
  }, []);

  return (
    <ThemeProvider>
      <IonApp>
        <IonReactRouter history={appHistory}>
          <BrowserForwardRestorer />
          <IonRouterOutlet>
            <Route exact path="/home">
              {withRouteLoading(<HomePage />)}
            </Route>
            <Route exact path="/ride-lobby/:rideId">
              {withRouteLoading(<RideLobbyPage />)}
            </Route>
            <Route exact path="/ride-map/:rideId">
              {withRouteLoading(<RideMapPage />)}
            </Route>
            <Route exact path="/account">
              {withRouteLoading(<AccountPage />)}
            </Route>
            <Route exact path="/ride-history">
              {withRouteLoading(<RideHistoryPage />)}
            </Route>
            <Route
              exact
              path="/ride-history-stats/:rideId/share"
              render={(props: RouteComponentProps<{ rideId: string }>) => (
                withRouteLoading(
                  <ShareImagePage rideId={props.match.params.rideId ?? 'demo1'} />,
                )
              )}
            />
            <Route
              exact
              path="/ride-history-stats/:rideId"
              render={(props: RouteComponentProps<{ rideId: string }>) => (
                withRouteLoading(
                  <RideHistoryStatsPage rideId={props.match.params.rideId ?? 'demo1'} />,
                )
              )}
            />
            <Route exact path="/ride-replay/:rideId">
              {withRouteLoading(<RideReplayPage />)}
            </Route>
            <Route exact path="/">
              <Redirect to="/home" />
            </Route>
          </IonRouterOutlet>
          <AppNavigation />
        </IonReactRouter>
      </IonApp>
    </ThemeProvider>
  );
};

export default App;
