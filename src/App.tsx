 
import { IonApp, IonRouterOutlet, IonTabs, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import AppRoutes from './routes';
import { TabBar, FloatingFab, AuthProvider } from './shared/components';

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
        <AuthProvider>
          <IonTabs>
            <IonRouterOutlet>
              <AppRoutes />
            </IonRouterOutlet>
            <TabBar />
          </IonTabs>
          {/* Floating FAB placed outside the tabs so it won't be clipped by tab bar */}
          <FloatingFab />
        </AuthProvider>
      </IonReactRouter>
  </IonApp>
  );
};

export default App;
