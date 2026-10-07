import {
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonToast
} from '@ionic/react';
import { useEffect, useMemo, useState } from 'react';
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
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

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

  const handleCopyRideCode = async () => {
    if (!rideId) return;
    try {
      await navigator.clipboard.writeText(rideId);
      setCopyMessage('Ride code copied. Send it to your crew.');
    } catch {
      setCopyMessage('Copy is unavailable here. You can select the code above.');
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonTitle>Lobby</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="app-page page-content lobby-page">

        <div className="page-hero">
          <h1>Your ride<br /><span>is waiting.</span></h1>
          <p>Invite your riders with this code, then start when everyone is ready.</p>
        </div>

        {/* Ride code */}
        <div className="ride-code-display">
          <p className="ride-code-label">Ride code</p>
          <div className="lobby-code-row">
            <span className="ride-code-value">{rideId ?? '---'}</span>
            <button className="lobby-copy-code" type="button" onClick={handleCopyRideCode} disabled={!rideId}>
              Copy invite
            </button>
          </div>
        </div>

        {/* Participants */}
        <div className="glass-card">
          <span className="card-label">
            Riders in this group{riderList.length > 0 ? ` · ${riderList.length}` : ''}
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

        <IonToast
          isOpen={copyMessage !== null}
          message={copyMessage ?? ''}
          duration={2200}
          onDidDismiss={() => setCopyMessage(null)}
        />

      </IonContent>
    </IonPage>
  );
};

export default RideLobbyPage;
