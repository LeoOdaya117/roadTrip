import React, { useEffect, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent } from '@ionic/react';
import { fetchRideById } from '../api/ride';
import ShareImageGenerator from '../components/ShareImage/ShareImageGenerator';
import type { Ride } from '../types/ride';
import '../styles/ride-history-styles.css';

type Props = { rideId: string };

export default function ShareImagePage({ rideId }: Props) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchRideById(rideId)
      .then(r => {
        if (!mounted) return;
        setRide(r);
        setLoading(false);
      })
      .catch(err => {
        if (!mounted) return;
        setError(String(err));
        setLoading(false);
      });
    return () => { mounted = false };
  }, [rideId]);

  if (loading) return <IonPage><IonContent className="app-page"><div className="screen-state" role="status">Loading ride details…</div></IonContent></IonPage>;
  if (error) return <IonPage><IonContent className="app-page"><div className="screen-state" role="alert">Couldn’t load this ride. {error}</div></IonContent></IonPage>;
  if (!ride) return <IonPage><IonContent className="app-page"><div className="screen-state" role="status">Ride not found.</div></IonContent></IonPage>;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/ride-history-stats/${rideId}`} />
          </IonButtons>
          <IonTitle>Create Share Image</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="app-page page-content share-screen">
        <div className="screen-shell">
          <ShareImageGenerator ride={ride} />
        </div>
      </IonContent>
    </IonPage>
  );
}
