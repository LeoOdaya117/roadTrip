import { Redirect, Route } from 'react-router-dom';
import {
  IonApp,
  IonRouterOutlet,
  setupIonicReact
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import HomePage from './pages/HomePage';
import RideLobbyPage from './pages/RideLobbyPage';
import RideMapPage from './pages/RideMapPage';
import AccountPage from './pages/AccountPage';
import RideHistoryPage from './pages/RideHistoryPage';
import RideReplayPage from './pages/RideReplayPage';
import RideHistoryStatsPage from './pages/RideHistoryStatsPage';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* Ionic Dark Mode */
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';
import './App.css';

setupIonicReact();

if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: true });
  StatusBar.setStyle({ style: Style.Dark });
}

const App: React.FC = () => (
  <IonApp>
    <IonReactRouter>
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
        <Route exact path="/ride-history-stats/:rideId" render={(props) => {
          // react-router v5 match param extraction
          // @ts-ignore
          const id = props.match?.params?.rideId ?? 'demo1';
          return <RideHistoryStatsPage rideId={id} />;
        }} />
        <Route exact path="/ride-replay/:rideId">
          <RideReplayPage />
        </Route>
        <Route exact path="/">
          <Redirect to="/home" />
        </Route>
      </IonRouterOutlet>
    </IonReactRouter>
  </IonApp>
);

export default App;
