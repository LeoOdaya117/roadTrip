import type { ReactNode } from 'react';
import { IonBackButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/react';
import './AppHeader.css';

type AppHeaderProps = {
  title: ReactNode;
  backHref?: string;
  actions?: ReactNode;
  className?: string;
};

/** Shared RoadTrip header for standard (non-immersive) pages. */
export default function AppHeader({ title, backHref, actions, className }: AppHeaderProps) {
  return (
    <IonHeader className={`rt-app-header ion-no-border${className ? ` ${className}` : ''}`}>
      <IonToolbar className="rt-app-header__toolbar">
        {backHref && (
          <IonButtons slot="start" className="rt-app-header__back">
            <IonBackButton defaultHref={backHref} />
          </IonButtons>
        )}
        <div
          slot={backHref ? 'primary' : 'start'}
          className={`rt-app-header__identity${backHref ? ' rt-app-header__identity--page' : ''}`}
        >
          <IonTitle
            className="rt-app-header__title"
            style={{
              fontSize: 'clamp(16px, 4vw, 18px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </IonTitle>
        </div>
        {actions && <IonButtons slot="end" className="rt-app-header__actions">{actions}</IonButtons>}
      </IonToolbar>
    </IonHeader>
  );
}
