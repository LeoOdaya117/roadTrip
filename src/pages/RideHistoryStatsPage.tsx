import React, { useEffect, useState } from 'react';
import { useLocation, useHistory } from 'react-router-dom';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent } from '@ionic/react';
import ReplayIcon from '../components/Icons/ReplayIcon';
import { fetchRideById } from '../api/ride';
import MapView from '../components/RideMap/MapView';
import StatsPanel from '../components/RideStats/StatsPanel';
import GalleryGrid from '../components/Gallery/GalleryGrid';
import type { Ride } from '../types/ride';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import '../styles/ride-history-styles.css';

type Props = { rideId: string };

export default function RideHistoryStatsPage({ rideId }: Props) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const location = useLocation();
  const history = useHistory();
  const params = new URLSearchParams(location.search);
  const [replayMode, setReplayMode] = useState<boolean>(params.get('mode') === 'replay');
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    // update replay mode if query changes
    const p = new URLSearchParams(location.search);
    setReplayMode(p.get('mode') === 'replay');

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
  }, [location.search, rideId]);

  useEffect(() => {
    if (!mapInstance) return;
    // allow layout to settle then invalidate size so Leaflet redraws properly
    const t = setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch (error) { console.warn('invalidateSize failed', error); }
    }, 200);
    return () => clearTimeout(t);
  }, [mapInstance]);

  // ensure map fits the route once both map and ride data are available
  useEffect(() => {
    if (!mapInstance || !ride) return;
    try {
      // extract lat-lng pairs from ride.polylineGeoJSON (convert [lng,lat] -> [lat,lng])
      let latlngs: [number, number][] = [];
      const geo = ride.polylineGeoJSON;
      const geometry = geo.type === 'Feature' ? geo.geometry : geo;
      if (geometry.type === 'LineString') {
        latlngs = geometry.coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);
      }
      if (latlngs.length > 0) {
        setTimeout(() => {
          try {
            mapInstance.invalidateSize();
            mapInstance.fitBounds(latlngs as LatLngBoundsExpression, { padding: [40, 40] });
          } catch (e) { console.warn('fitBounds failed', e); }
        }, 300);
      }
    } catch (e) { console.warn('fit route failed', e); }
  }, [mapInstance, ride]);

  if (loading) return <IonPage><IonContent className="app-page"><div className="screen-state" role="status">Loading ride summary…</div></IonContent></IonPage>;
  if (error) return <IonPage><IonContent className="app-page"><div className="screen-state" role="alert">Couldn’t load this ride. {error}</div></IonContent></IonPage>;
  if (!ride) return <IonPage><IonContent className="app-page"><div className="screen-state" role="status">Ride not found.</div></IonContent></IonPage>;

  const saveSampleToLocal = () => {
    const key = `ride:${rideId}`;
    try {
      localStorage.setItem(key, JSON.stringify(ride));
      alert('Saved sample ride to localStorage under ' + key);
    } catch (err) {
      console.warn(err);
      alert('Failed to save to localStorage');
    }
  };

  const togglePlay = () => {
    setPlaying((v) => !v);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/ride-history" />
          </IonButtons>
          <IonTitle>Ride Summary</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="summary-screen app-page">
        <div className="ride-history-page">
          {replayMode && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, margin: '12px 12px 0 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="icon-btn primary" onClick={togglePlay} title={playing ? 'Stop replay' : 'Start replay'}>
                  <ReplayIcon />
                  <span>{playing ? 'Stop' : 'Start'} Replay</span>
                </button>
              </div>
            </div>
          )}

          <div className="rh-container">
            <div className="rh-side" style={{ display: 'grid', gap: 12 }}>
              <div className="rh-card">
                <div className="rh-section-title">Summary</div>
                <StatsPanel
                  distanceMeters={ride.distanceMeters}
                  durationSeconds={ride.durationSeconds}
                  avgSpeedMs={ride.avgSpeedMs}
                  maxSpeedMs={ride.maxSpeedMs}
                  elevationGainMeters={ride.elevationGainMeters}
                  stopoverCount={ride.stopoverCount}
                />
              </div>

              <div className="rh-card">
                <div className="rh-section-title">Photos</div>
                <GalleryGrid photoUrls={ride.photoUrls} />
              </div>

              <div className="rh-card">
                <div className="rh-section-title">Customize</div>
                <p style={{ marginBottom: 12, opacity: 0.7, fontSize: 14 }}>Replay the route or create an image to share this ride.</p>
                <button
                  className="rh-generate-btn"
                  onClick={() => history.push(`/ride-replay/${rideId}`)}
                  style={{ width: '100%', marginBottom: 8 }}
                >
                  Replay ride
                </button>
                <button 
                  className="rh-generate-btn" 
                  onClick={() => history.push(`/ride-history-stats/${rideId}/share`)}
                  style={{ width: '100%' }}
                >
                  Create Share Image
                </button>
              </div>

              

              <div>
                <button className="rh-small-btn" onClick={saveSampleToLocal} style={{ marginTop: 8 }}>Save sample ride to localStorage</button>
              </div>
            </div>

            <div className="rh-card rh-map">
              <MapView polylineGeoJSON={ride.polylineGeoJSON} height={420} onMapReady={m => setMapInstance(m)} />
            </div>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
