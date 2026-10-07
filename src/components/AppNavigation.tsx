import { IonIcon } from '@ionic/react';
import { homeOutline, personOutline, timeOutline } from 'ionicons/icons';
import { useHistory, useLocation } from 'react-router-dom';

const items = [
  { label: 'Home', path: '/home', icon: homeOutline },
  { label: 'Rides', path: '/ride-history', icon: timeOutline },
  { label: 'Profile', path: '/account', icon: personOutline },
];

export default function AppNavigation() {
  const history = useHistory();
  const location = useLocation();
  const visible = ['/home', '/ride-history', '/account'].includes(location.pathname);

  if (!visible) return null;

  return (
    <nav className="route-navigation" aria-label="Main navigation">
      {items.map((item) => {
        const active = location.pathname === item.path;
        return (
          <button
            key={item.path}
            type="button"
            className={`route-navigation-item${active ? ' route-navigation-item-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => history.push(item.path)}
          >
            <IonIcon icon={item.icon} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
