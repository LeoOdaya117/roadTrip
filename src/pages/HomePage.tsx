import {
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonToast,
  IonButtons,
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { createRide, joinRide } from '../services/api';
import { createLocalUser } from '../services/user';
import { getRideSession, saveRideSession } from '../services/offlineDb';
import { useRideStore } from '../store/rideStore';
import { RideSession } from '../types/ride';
import { useCallback } from 'react';

const HomePage: React.FC = () => {
  const history = useHistory();
  const setUser = useRideStore((state) => state.setUser);
  const setRide = useRideStore((state) => state.setRide);
  const updateRiders = useRideStore((state) => state.updateRiders);
  const clearRide = useRideStore((state) => state.clearRide);
  const setSoloMode = useRideStore((state) => state.setSoloMode);

  const [joinCode, setJoinCode] = useState('');
  const [loadingAction, setLoadingAction] = useState<'create' | 'join' | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<RideSession | null>(null);

  const currentUser = useRideStore((state) => state.currentUser);

  useEffect(() => {
    getRideSession()
      .then((session) => setSavedSession(session ?? null))
      .catch(() => undefined);
  }, []);

  const handleCreateRide = async () => {
    try {
      setLoadingAction('create');
      const user = createLocalUser(true);
      setUser(user);

      const response = await createRide(user);
      const rideId = response.rideId;

      // clear any previous ride state before starting a new one
      clearRide();
      setRide(rideId);
      if (response.rider) {
        updateRiders([{ ...response.rider, isHost: true }]);
      }
      if (response.riders?.length) {
        updateRiders(response.riders);
      }

      const session: RideSession = {
        rideId,
        userId: user.id,
        userName: user.name,
        isHost: true,
        createdAt: new Date().toISOString()
      };
      await saveRideSession(session);
      setSavedSession(session);

      history.push(`/ride-lobby/${rideId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create ride.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleJoinRide = async () => {
    const trimmedCode = joinCode.trim();
    if (!trimmedCode) {
      setError('Enter a ride code to join.');
      return;
    }

    try {
      setLoadingAction('join');
      const user = createLocalUser(false);
      setUser(user);

      const response = await joinRide(trimmedCode, user);
      // clear previous ride state to avoid leftover markers
      clearRide();
      setRide(response.rideId);

      if (response.rider) {
        updateRiders([response.rider]);
      }
      if (response.riders?.length) {
        updateRiders(response.riders);
      }

      const session: RideSession = {
        rideId: response.rideId,
        userId: user.id,
        userName: user.name,
        isHost: false,
        createdAt: new Date().toISOString()
      };
      await saveRideSession(session);
      setSavedSession(session);

      history.push(`/ride-lobby/${response.rideId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join ride.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResumeRide = () => {
    if (!savedSession) {
      return;
    }

    setUser({
      id: savedSession.userId,
      name: savedSession.userName,
      isHost: savedSession.isHost
    });
    // clear prior ride state before resuming
    clearRide();
    setRide(savedSession.rideId);
    if (savedSession.isSolo) {
      setSoloMode(true);
      history.push(`/ride-map/${savedSession.rideId}`);
    } else {
      history.push(`/ride-lobby/${savedSession.rideId}`);
    }
  };

  const handleSoloRide = async () => {
    try {
      setLoadingAction('solo' as typeof loadingAction);
      const user = createLocalUser(true);
      setUser(user);
      const rideId = `solo-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(16)}`;
      // clear previous ride state then set ride id
      clearRide();
      setRide(rideId);
      // enable solo mode after clearing state (clearRide resets isSoloMode)
      setSoloMode(true);

      const session: RideSession = {
        rideId,
        userId: user.id,
        userName: user.name,
        isHost: true,
        isSolo: true,
        createdAt: new Date().toISOString()
      };
      await saveRideSession(session);
      setSavedSession(session);

      history.push(`/ride-map/${rideId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start solo ride.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonTitle>RoadTrip</IonTitle>
          <IonButtons slot="end">
            <button
              className="home-account-btn"
              onClick={() => history.push('/account')}
              aria-label="Account"
            >
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} className="home-account-avatar" alt="Profile" />
              ) : (
                <span className="home-account-initials">
                  {(currentUser?.name ?? 'R').slice(0, 2).toUpperCase()}
                </span>
              )}
            </button>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="app-page page-content">

        <div className="page-hero">
          <p className="hero-eyebrow">Live tracking</p>
          <h1>Ride together,<br /><span>stay connected.</span></h1>
          <p>Create or join a trip and track everyone on one map.</p>
        </div>

        <div className="home-actions">
          <button className="btn-ghost" onClick={() => history.push('/ride-history')}>View ride history</button>
        </div>

        <div className="home-grid">
          <div className="glass-card">
            <span className="card-label">Solo ride</span>
            <p className="card-description">
              Track your own route offline. No internet or invite needed.
            </p>
            <button
              className="btn-secondary"
              onClick={handleSoloRide}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'solo' ? (
                <span className="btn-inner">
                  <IonSpinner name="dots" style={{ width: 18, height: 18 }} />
                  Starting…
                </span>
              ) : 'Start Solo Ride'}
            </button>
          </div>

          <div className="glass-card card-feature">
            <span className="card-label">New ride</span>
            <p className="card-description">
              Start a session and invite friends with a shareable code.
            </p>
            <button
              className="btn-primary btn-primary-lg"
              onClick={handleCreateRide}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'create' ? (
                <span className="btn-inner">
                  <IonSpinner name="dots" style={{ width: 18, height: 18 }} />
                  Creating…
                </span>
              ) : 'Create Ride'}
            </button>
          </div>

          <div className="glass-card">
            <span className="card-label">Join a ride</span>
            <div className="input-group">
              <label className="input-label" htmlFor="ride-code">Ride code</label>
              <input
                id="ride-code"
                className="custom-input"
                type="text"
                placeholder="Enter code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button
              className="btn-primary"
              onClick={handleJoinRide}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'join' ? (
                <span className="btn-inner">
                  <IonSpinner name="dots" style={{ width: 18, height: 18 }} />
                  Joining…
                </span>
              ) : 'Join Ride'}
            </button>
          </div>
        </div>

        {/* Resume last session */}
        {savedSession && (
          <div className="glass-card">
            <span className="card-label">Last session</span>
            <p className="card-description">
              Code: <span className="session-id">{savedSession.rideId}</span>
            </p>
            <button className="btn-secondary" onClick={handleResumeRide}>
              Resume Ride
            </button>
          </div>
        )}

      </IonContent>
      <IonToast
        isOpen={error !== null}
        message={error ?? ''}
        color="danger"
        duration={2500}
        onDidDismiss={() => setError(null)}
      />
    </IonPage>
  );
};

export default HomePage;
