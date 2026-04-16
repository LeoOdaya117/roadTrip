import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  IonToast
} from '@ionic/react';
import { locate, pause, play } from 'ionicons/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type L from 'leaflet';
import RideMapView from '../components/RideMapView';
import { useLocationTracker } from '../hooks/useLocationTracker';
import { useMockRiders } from '../hooks/useMockRiders';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useRideChannel } from '../hooks/useRideChannel';
import { useRideLocationSync } from '../hooks/useRideLocationSync';
import { getLastLocation } from '../services/offlineDb';
import { useRideStore } from '../store/rideStore';

const FALLBACK_CENTER = { lat: 37.7749, lng: -122.4194 };

const RideMapPage: React.FC = () => {
  const { rideId: routeRideId } = useParams<{ rideId: string }>();
  const rideId = useRideStore((state) => state.rideId) ?? routeRideId;
  const setRide = useRideStore((state) => state.setRide);
  const currentUser = useRideStore((state) => state.currentUser);
  const ridersMap = useRideStore((state) => state.riders);
  const updateSingleRider = useRideStore((state) => state.updateSingleRider);
  const isTracking = useRideStore((state) => state.isTracking);
  const setTracking = useRideStore((state) => state.setTracking);

  const [fallbackCenter, setFallbackCenter] = useState(FALLBACK_CENTER);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const hasCenteredRef = useRef(false);

  const isOnline = useNetworkStatus();
  const {
    location,
    isTracking: trackerIsTracking,
    permission,
    error,
    startTracking,
    stopTracking
  } = useLocationTracker(false);

  useEffect(() => {
    if (routeRideId) {
      setRide(routeRideId);
    }
  }, [routeRideId, setRide]);

  useEffect(() => {
    setTracking(true);
  }, [setTracking]);

  useEffect(() => {
    if (!isTracking) {
      return;
    }

    startTracking();
    return () => stopTracking();
  }, [isTracking, startTracking, stopTracking]);

  useEffect(() => {
    if (trackerIsTracking !== isTracking) {
      setTracking(trackerIsTracking);
    }
  }, [trackerIsTracking, isTracking, setTracking]);

  useEffect(() => {
    if (error) {
      setErrorMessage(error);
    }
  }, [error]);

  useEffect(() => {
    if (!rideId) {
      return;
    }

    getLastLocation(rideId)
      .then((stored) => {
        if (stored) {
          setFallbackCenter({ lat: stored.lat, lng: stored.lng });
        }
      })
      .catch(() => undefined);
  }, [rideId]);

  useEffect(() => {
    if (!location || !currentUser) {
      return;
    }

    updateSingleRider({
      id: currentUser.id,
      name: currentUser.name,
      isHost: currentUser.isHost,
      lat: location.lat,
      lng: location.lng,
      speed: location.speed,
      timestamp: location.timestamp
    });
  }, [currentUser, location, updateSingleRider]);

  useEffect(() => {
    if (location && mapRef.current && !hasCenteredRef.current) {
      mapRef.current.setView(
        [location.lat, location.lng],
        mapRef.current.getZoom() ?? 15
      );
      hasCenteredRef.current = true;
    }
  }, [location]);

  useRideChannel(rideId);

  const { syncStatus } = useRideLocationSync({
    rideId,
    riderId: currentUser?.id,
    isTracking,
    isOnline,
    location
  });

  const riders = useMemo(() => Object.values(ridersMap), [ridersMap]);

  const center = location
    ? { lat: location.lat, lng: location.lng }
    : fallbackCenter;

  useMockRiders({
    enabled: import.meta.env.VITE_ENABLE_MOCK_RIDERS !== 'false',
    origin: center
  });

  const handleCenterMap = () => {
    if (mapRef.current) {
      mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom() ?? 15);
    }
  };

  const handleToggleTracking = async () => {
    if (isTracking) {
      stopTracking();
      setTracking(false);
      return;
    }

    await startTracking();
    setTracking(true);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Live Ride</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ride-map-content" fullscreen>
        <div className="map-wrapper">
          <RideMapView
            center={center}
            riders={riders}
            currentUserId={currentUser?.id}
            onMapReady={(map) => {
              mapRef.current = map;
            }}
          />
          <div className="map-controls">
            <IonButton size="small" onClick={handleCenterMap}>
              <IonIcon icon={locate} slot="start" />
              Center
            </IonButton>
            <IonButton size="small" color={isTracking ? 'warning' : 'success'} onClick={handleToggleTracking}>
              <IonIcon icon={isTracking ? pause : play} slot="start" />
              {isTracking ? 'Pause Tracking' : 'Resume Tracking'}
            </IonButton>
          </div>
          <div className="map-status">
            <strong>Status</strong>
            <IonText>
            {isOnline ? 'Online' : 'Offline'} • {isTracking ? 'Tracking' : 'Paused'}
            </IonText>
            {permission !== 'granted' && (
              <IonText color="warning">Location permission required.</IonText>
            )}
            {syncStatus && <IonText color="warning">{syncStatus}</IonText>}
          </div>
        </div>
      </IonContent>
      <IonToast
        isOpen={errorMessage !== null}
        message={errorMessage ?? ''}
        color="danger"
        duration={2500}
        onDidDismiss={() => setErrorMessage(null)}
      />
    </IonPage>
  );
};

export default RideMapPage;
