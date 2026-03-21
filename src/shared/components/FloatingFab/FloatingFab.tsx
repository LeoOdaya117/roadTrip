import React from 'react';
import { IonFab, IonFabButton, IonIcon } from '@ionic/react';
import { add } from 'ionicons/icons';
import { useLocation } from 'react-router-dom';

interface FloatingFabProps {
  excludedPaths?: string[];
}

const FloatingFab: React.FC<FloatingFabProps> = ({ excludedPaths = ['/login'] }) => {
  const location = useLocation();

  if (excludedPaths.includes(location.pathname)) return null;

  return (
    <IonFab className="create-fab">
      <IonFabButton routerLink="/tab2" className="create-fab-button">
        <IonIcon icon={add} />
      </IonFabButton>
    </IonFab>
  );
};

export default FloatingFab;
