import { Redirect, Route } from 'react-router-dom';
import {
  IonApp,
  IonIcon,
  IonLabel,
  IonFab,
  IonFabButton,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  setupIonicReact
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { ellipse, home, person, square, triangle, add, settings } from 'ionicons/icons';
import Tab1 from './pages/Tab1';
import Tab2 from './pages/Tab2';
import Tab3 from './pages/Tab3';

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

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* import '@ionic/react/css/palettes/dark.always.css'; */
/* import '@ionic/react/css/palettes/dark.class.css'; */
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';
import './App.css';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Filesystem } from '@capacitor/filesystem';
import React, { useEffect, useState } from 'react';

setupIonicReact();

const App: React.FC = () => {
  const [isAppInitialized, setIsAppInitialized] = useState(false);

  useEffect(() => {
    console.log('[App] Initializing application...');

    const checkAndRequestFilesystemPermission = async () => {
      try {
        const permissionStatus = await Filesystem.checkPermissions();
        console.log('Current permission:', permissionStatus);

        if (permissionStatus.publicStorage !== 'granted') {
          const requestStatus = await Filesystem.requestPermissions();
          console.log('Request result:', requestStatus);

          if (requestStatus.publicStorage === 'granted') {
            console.log('Filesystem permission granted!');
          } else {
            console.warn('Filesystem permission denied by user.');
          }
        } else {
          console.log('Filesystem permission already granted.');
        }
      } catch (err) {
        console.error('Error checking/requesting permission:', err);
      }
    };

    const configureStatusBarAndNotifications = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#ffffff' });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch (e) {
        console.log('StatusBar not available on this platform');
      }
    };

    

    const initializeApp = async () => {
      try {
        await checkAndRequestFilesystemPermission();
        await configureStatusBarAndNotifications();

    
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log('[App] App initialization complete');
        setIsAppInitialized(true);
      } catch (error) {
        console.error('[App] Error during initialization:', error);
        setIsAppInitialized(true);
      }
    };

    initializeApp();
  }, []);

  return (
    <IonApp>
    <IonReactRouter>
      <IonTabs>
        <IonRouterOutlet>
          <Route exact path="/tab1">
            <Tab1 />
          </Route>
          <Route exact path="/tab2">
            <Tab2 />
          </Route>
          <Route path="/tab3">
            <Tab3 />
          </Route>
          <Route exact path="/">
            <Redirect to="/tab1" />
          </Route>
        </IonRouterOutlet>
        <IonTabBar slot="bottom" className="floating-tab-bar">
          <IonTabButton tab="tab1" href="/tab1">
            <IonIcon aria-hidden="true" icon={home} />
            <IonLabel>Home</IonLabel>
          </IonTabButton>

          <IonTabButton tab="tab2" href="/tab2">
            <IonLabel>Create Trip</IonLabel>
          </IonTabButton>
          <IonTabButton tab="tab3" href="/tab3">
            <IonIcon aria-hidden="true" icon={settings} />
            <IonLabel>Settings</IonLabel>
          </IonTabButton>

        </IonTabBar>
      </IonTabs>
      {/* Floating FAB placed outside the tabs so it won't be clipped by tab bar */}
      <IonFab className="create-fab">
        <IonFabButton routerLink="/tab2" className="create-fab-button">
          <IonIcon icon={add} />
        </IonFabButton>
      </IonFab>
    </IonReactRouter>
  </IonApp>
  );
};

export default App;
