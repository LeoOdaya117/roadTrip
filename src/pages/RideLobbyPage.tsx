import {
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar
} from '@ionic/react';
import { useEffect, useMemo } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useRideChannel } from '../hooks/useRideChannel';
import { useRideStore } from '../store/rideStore';

const RideLobbyPage: React.FC = () => {
  const history = useHistory();
  const { rideId: routeRideId } = useParams<{ rideId: string }>();

  const rideId = useRideStore((state) => state.rideId) ?? routeRideId;
  const currentUser = useRideStore((state) => state.currentUser);
  const setRide = useRideStore((state) => state.setRide);
  const riders = useRideStore((state) => state.riders);

  useEffect(() => {
    if (routeRideId) {
      setRide(routeRideId);
    }
  }, [routeRideId, setRide]);

  useRideChannel(rideId);

  const riderList = useMemo(() => {
    const list = Object.values(riders);
    if (currentUser && !riders[currentUser.id]) {
      list.unshift({
        id: currentUser.id,
        name: currentUser.name,
        lat: 0,
        lng: 0,
        speed: null,
        timestamp: new Date().toISOString(),
        isHost: currentUser.isHost
      });
    }
    return list;
  }, [currentUser, riders]);

  const handleStartRide = () => {
    if (!rideId) return;
    history.push(`/ride-map/${rideId}`);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonTitle>Lobby</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="app-page page-content">

        <div className="page-hero">
          <p className="hero-eyebrow">Ready to roll</p>
          <h1>Your ride<br /><span>is waiting.</span></h1>
          <p>Share the code below with your group.</p>
        </div>

        {/* Ride code */}
        <div className="ride-code-display">
          <p className="ride-code-label">Ride code</p>
          <span className="ride-code-value">{rideId ?? '---'}</span>
        </div>

        {/* Participants */}
        <div className="glass-card">
          <span className="card-label">
            Participants{riderList.length > 0 ? ` · ${riderList.length}` : ''}
          </span>
          <div className="rider-list">
            {riderList.length === 0 && (
              <div className="waiting-text">
                <IonSpinner name="dots" style={{ width: 16, height: 16, marginBottom: 6 }} />
                <p style={{ margin: '4px 0 0' }}>Waiting for riders…</p>
              </div>
            )}
            {riderList.map((rider) => (
              <div className="rider-item" key={rider.id}>
                <div className="rider-avatar">{rider.name.charAt(0)}</div>
                <span className="rider-name">{rider.name}</span>
                {rider.isHost && <span className="host-badge">Host</span>}
              </div>
            ))}
          </div>
        </div>

        {currentUser?.isHost ? (
          <button
            className="btn-primary"
            style={{ marginTop: 8 }}
            onClick={handleStartRide}
          >
            Start Ride
          </button>
        ) : (
          <p className="waiting-text">Waiting for the host to start the ride.</p>
        )}

      </IonContent>
    </IonPage>
  );
};

export default RideLobbyPage;
