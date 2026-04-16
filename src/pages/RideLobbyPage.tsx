import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonText,
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
    if (!rideId) {
      return;
    }
    history.push(`/ride-map/${rideId}`);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Ride Lobby</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="page-content">
        <IonText color="medium">Ride code</IonText>
        <h2>{rideId ?? '---'}</h2>

        <IonText color="medium">Participants</IonText>
        <IonList inset>
          {riderList.length === 0 && (
            <IonItem>
              <IonLabel>Waiting for riders...</IonLabel>
            </IonItem>
          )}
          {riderList.map((rider) => (
            <IonItem key={rider.id}>
              <IonLabel>{rider.name}</IonLabel>
              {rider.isHost && <IonBadge color="primary">Host</IonBadge>}
            </IonItem>
          ))}
        </IonList>

        {currentUser?.isHost ? (
          <IonButton expand="block" onClick={handleStartRide}>
            Start Ride
          </IonButton>
        ) : (
          <IonText className="rider-badge">
            Waiting for the host to start the ride.
          </IonText>
        )}
      </IonContent>
    </IonPage>
  );
};

export default RideLobbyPage;
