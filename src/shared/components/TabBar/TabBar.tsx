import React from 'react';
import { IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/react';
import { home, settings, add } from 'ionicons/icons';
import { useLocation } from 'react-router-dom';

interface TabBarProps {
  hidden?: boolean;
  excludedPaths?: string[];
}

const TabBar: React.FC<TabBarProps> = ({ hidden, excludedPaths = ['/login', '/signup'] }) => {
  const location = useLocation();

  const isExcluded = excludedPaths.includes(location.pathname);
  if (hidden || isExcluded) return null;

  return (
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
  );
};

export default TabBar;
