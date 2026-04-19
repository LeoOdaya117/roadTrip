import {
  IonContent,
  IonHeader,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonToast,
  IonButtons,
  IonSegment,
  IonSegmentButton,
  IonIcon,
} from '@ionic/react';
import { people, person, key, add, play, refresh } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { createRide, joinRide } from '../services/api';
import { createLocalUser } from '../services/user';
import { getRideSession, getAllSessions, saveRideSession, deleteSession } from '../services/offlineDb';
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
  const [startMode, setStartMode] = useState<'group' | 'solo'>('group');
  const [error, setError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<RideSession | null>(null);

  const currentUser = useRideStore((state) => state.currentUser);

  const refreshSavedSession = async () => {
    try {
      const sessions = await getAllSessions();
      const active = sessions.find((s) => !s.endedAt);
      setSavedSession(active ?? null);
    } catch (e) {
      try {
        const session = await getRideSession();
        setSavedSession(session ?? null);
      } catch (err) {
        setSavedSession(null);
      }
    }
  };

  useEffect(() => {
    refreshSavedSession();
  }, []);

  useIonViewWillEnter(() => {
    refreshSavedSession();
  });

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
          {/* last-session pill removed from header — moved into page content */}
        </IonToolbar>
      </IonHeader>
      <IonContent className="app-page page-content home-minimal">

        <div className="page-hero">
          <div className="hero-inner">
            <p className="hero-eyebrow">Live tracking</p>
            <h1>Ride together,<br /><span>stay connected.</span></h1>
            <p className="hero-sub">Create or join a trip and track everyone on one map.</p>
          </div>
        </div>

        <div className="home-actions">
          <button className="btn-ghost" onClick={() => history.push('/ride-history')}>View ride history</button>
        </div>

        <div className="home-grid">
          {savedSession && (
            <div className="glass-card resume-card">
              <div className="card-head">
                <div className="card-head-left">
                  <IonIcon icon={play} className="card-icon" />
                  <span className="card-label">Resume ride</span>
                </div>
              </div>
              <p className="card-description">Continue your last session — Code: <span className="session-id">{savedSession.rideId}</span></p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={handleResumeRide}>Resume Ride</button>
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    if (!savedSession) return;
                    try {
                      await deleteSession(savedSession.rideId);
                      setSavedSession(null);
                    } catch (e) {
                      /* ignore */
                    }
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="glass-card card-feature card-hero">
            <div className="card-head">
              <div className="card-head-left">
                <IonIcon icon={add} className="card-icon large" />
                <span className="card-label">Start ride</span>
              </div>
            </div>
            <p className="card-description">Choose whether this ride is a group session or a solo route.</p>

            <div className="start-mode-toggle" style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 12 }}>
              <button className={startMode === 'group' ? 'chip chip-active' : 'chip'} onClick={() => setStartMode('group')}>Group</button>
              <button className={startMode === 'solo' ? 'chip chip-active' : 'chip'} onClick={() => setStartMode('solo')}>Solo</button>
            </div>

            <button
              className="btn-primary btn-primary-lg"
              onClick={async () => {
                if (startMode === 'group') {
                  await handleCreateRide();
                } else {
                  await handleSoloRide();
                }
              }}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'create' || loadingAction === 'solo' ? (
                <span className="btn-inner">
                  <IonSpinner name="dots" style={{ width: 18, height: 18 }} />
                  Starting…
                </span>
              ) : (startMode === 'group' ? 'Create Ride' : 'Start Solo')}
            </button>
          </div>

          <div className="glass-card join-card">
            <div className="quick-header">
              <div className="quick-title">Join Ride</div>
              <div className="quick-divider" />
            </div>
            <div className="quick-row">
              <div className="quick-item">
                <div className="card-head-left">
                  <IonIcon icon={people} className="card-icon" />
                  <div>
                    <div className="card-label">Join</div>
                    <div className="card-sub">Code</div>
                  </div>
                </div>
                <div className="input-group" style={{ marginTop: 8 }}>
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
                <div className="quick-actions-row">
                  <button className="mini-action" onClick={() => { /* focus input */ const el = document.getElementById('ride-code') as HTMLInputElement | null; el?.focus(); }} aria-label="Focus code input">
                    <IonIcon icon={key} />
                  </button>
                  <button className="btn-primary" onClick={handleJoinRide} disabled={loadingAction !== null}>
                    {loadingAction === 'join' ? (
                      <span className="btn-inner">
                        <IonSpinner name="dots" style={{ width: 18, height: 18 }} />
                        Joining…
                      </span>
                    ) : 'Join Ride'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* bottom resume card removed; moved into grid */}

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
