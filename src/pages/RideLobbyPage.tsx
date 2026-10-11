import {
  IonContent,
  IonPage,
  IonSpinner,
  IonToast,
  IonIcon,
} from '@ionic/react';
import { copyOutline, peopleOutline } from 'ionicons/icons';
import { useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useRideChannel } from '../hooks/useRideChannel';
import { useRideStore } from '../store/rideStore';
import AppHeader from '../components/AppHeader';

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
      setCopyMessage('Copy was blocked. Select the ride code above to share it.');
    }
  };

  return (
    <IonPage>
      <AppHeader title="Lobby" />
      <IonContent className="app-page page-content lobby-page">

        <div className="page-hero">
          <h1>Your crew<br /><span>is assembling.</span></h1>
          <p>Share the ride code, then start when everyone is ready.</p>
        </div>

        {/* Ride code */}
        <div className="ride-code-display">
          <p className="ride-code-label">Ride code</p>
          <div className="lobby-code-row">
            <span className="ride-code-value">{rideId ?? '---'}</span>
            <button className="lobby-copy-code" type="button" onClick={handleCopyRideCode} disabled={!rideId}>
              <IonIcon icon={copyOutline} aria-hidden="true" />
              Copy invite
            </button>
          </div>
        </div>

        {/* Participants */}
        <div className="glass-card">
          <div className="card-head-left">
            <IonIcon icon={peopleOutline} className="card-icon" aria-hidden="true" />
            <h2 className="card-label" style={{ margin: 0 }}>
              Riders{riderList.length > 0 ? ` · ${riderList.length}` : ''}
            </h2>
          </div>
          <div className="rider-list">
            {riderList.length === 0 && (
              <div className="waiting-text" role="status" aria-live="polite">
                <IonSpinner name="dots" style={{ width: 16, height: 16, marginBottom: 6 }} />
                <p style={{ margin: '4px 0 0' }}>Waiting for your crew to join…</p>
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
            disabled={!rideId}
          >
            Start group ride
          </button>
        ) : (
          <p className="waiting-text" role="status" aria-live="polite">Waiting for the host to start the ride.</p>
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
