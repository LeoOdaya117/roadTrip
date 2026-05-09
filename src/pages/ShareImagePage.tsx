import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
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

  if (loading) return <div style={{ padding: 20 }}>Loading ride...</div>;
  if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;
  if (!ride) return <div style={{ padding: 20 }}>Ride not found.</div>;

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
      <IonContent>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
          <ShareImageGenerator ride={ride} />
        </div>
      </IonContent>
    </IonPage>
  );
}
