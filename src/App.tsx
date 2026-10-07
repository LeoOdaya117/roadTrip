import { lazy, Suspense, useEffect } from 'react';
import { Redirect, Route, type RouteComponentProps } from 'react-router-dom';
import {
  IonApp,
  IonRouterOutlet,
  setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

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

setupIonicReact();

const App: React.FC = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setOverlaysWebView({ overlay: true });
    void StatusBar.setStyle({ style: Style.Dark });
  }, []);

  return (
    <IonApp>
      <IonReactRouter>
        <Suspense fallback={null}>
          <IonRouterOutlet>
            <Route exact path="/home">
              <HomePage />
            </Route>
            <Route exact path="/ride-lobby/:rideId">
              <RideLobbyPage />
            </Route>
            <Route exact path="/ride-map/:rideId">
              <RideMapPage />
            </Route>
            <Route exact path="/account">
              <AccountPage />
            </Route>
            <Route exact path="/ride-history">
              <RideHistoryPage />
            </Route>
            <Route
              exact
              path="/ride-history-stats/:rideId/share"
              render={(props: RouteComponentProps<{ rideId: string }>) => (
                <ShareImagePage rideId={props.match.params.rideId ?? 'demo1'} />
              )}
            />
            <Route
              exact
              path="/ride-history-stats/:rideId"
              render={(props: RouteComponentProps<{ rideId: string }>) => (
                <RideHistoryStatsPage rideId={props.match.params.rideId ?? 'demo1'} />
              )}
            />
            <Route exact path="/ride-replay/:rideId">
              <RideReplayPage />
            </Route>
            <Route exact path="/">
              <Redirect to="/home" />
            </Route>
          </IonRouterOutlet>
        </Suspense>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
