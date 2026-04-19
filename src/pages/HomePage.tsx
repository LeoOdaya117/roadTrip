import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonPage,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  IonToast
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { createRide, joinRide } from '../services/api';
import { createLocalUser } from '../services/user';
import { getRideSession, saveRideSession } from '../services/offlineDb';
import { useRideStore } from '../store/rideStore';
import { RideSession } from '../types/ride';

const HomePage: React.FC = () => {
  const history = useHistory();
  const setUser = useRideStore((state) => state.setUser);
  const setRide = useRideStore((state) => state.setRide);
  const updateRiders = useRideStore((state) => state.updateRiders);

  const [joinCode, setJoinCode] = useState('');
  const [loadingAction, setLoadingAction] = useState<'create' | 'join' | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [savedSession, setSavedSession] = useState<RideSession | null>(null);

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
    setRide(savedSession.rideId);
    history.push(`/ride-lobby/${savedSession.rideId}`);
  };

  return (
      <IonPage>
        <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonTitle>RoadTrip Live</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="page-content app-page home-page">
        <div className="page-hero">
          <h1>Ride together, live.</h1>
          <p>Create or join a trip and track everyone in one map.</p>
        </div>
        <IonCard className="app-card">
          <IonCardHeader>
            <IonCardTitle>Create a ride</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <IonText color="medium">
              Start a new ride session and invite friends with a code.
            </IonText>
            <IonButton
              expand="block"
              onClick={handleCreateRide}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'create' ? (
                <IonSpinner name="dots" />
              ) : (
                'Create Ride'
              )}
            </IonButton>
          </IonCardContent>
        </IonCard>

        <IonCard className="app-card">
          <IonCardHeader>
            <IonCardTitle>Join a ride</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <IonInput
              label="Ride code"
              labelPlacement="stacked"
              placeholder="Enter code"
              value={joinCode}
              onIonInput={(event) => setJoinCode(event.detail.value ?? '')}
            />
            <IonButton
              expand="block"
              onClick={handleJoinRide}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'join' ? (
                <IonSpinner name="dots" />
              ) : (
                'Join Ride'
              )}
            </IonButton>
          </IonCardContent>
        </IonCard>

        {savedSession && (
          <IonCard className="app-card">
            <IonCardHeader>
              <IonCardTitle>Resume last ride</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonText color="medium">
                Ride code: <strong>{savedSession.rideId}</strong>
              </IonText>
              <IonButton expand="block" fill="outline" onClick={handleResumeRide}>
                Resume Ride
              </IonButton>
            </IonCardContent>
          </IonCard>
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
