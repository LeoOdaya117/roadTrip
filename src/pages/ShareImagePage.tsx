import React, { useEffect, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { fetchRideById } from '../api/ride';
import ShareImageGenerator from '../components/ShareImage/ShareImageGenerator';
import type { Ride } from '../types/ride';
import '../styles/ride-history-styles.css';
import AppHeader from '../components/AppHeader';

type Props = { rideId: string };

export default function ShareImagePage({ rideId }: Props) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let photoUrls: string[] = [];
    setLoading(true);
    setError(null);
    fetchRideById(rideId)
      .then(r => {
        if (!mounted) {
          r.photoUrls.filter((url) => url.startsWith('blob:')).forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        photoUrls = r.photoUrls.filter((url) => url.startsWith('blob:'));
        setRide(r);
        setLoading(false);
      })
      .catch(err => {
        if (!mounted) return;
        setError(String(err));
        setLoading(false);
      });
    return () => {
      mounted = false;
      photoUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [rideId]);

  return (
    <IonPage>
      <AppHeader title="Create Share Image" backHref={`/ride-history-stats/${rideId}`} />
      <IonContent className="app-page page-content share-screen">
        {loading && <div className="screen-state" role="status">Loading ride details…</div>}
        {!loading && error && <div className="screen-state" role="alert">Couldn’t load this ride. {error}</div>}
        {!loading && !error && !ride && <div className="screen-state" role="status">Ride not found.</div>}
        {ride && !loading && !error && <div className="screen-shell share-page-shell">
          <div className="share-page-scroll">
            <ShareImageGenerator ride={ride} />
          </div>
        </div>}
      </IonContent>
    </IonPage>
  );
}
