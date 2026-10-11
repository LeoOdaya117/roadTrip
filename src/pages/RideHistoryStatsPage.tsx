import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useHistory } from 'react-router-dom';
import { IonPage, IonContent } from '@ionic/react';
import ReplayIcon from '../components/Icons/ReplayIcon';
import { fetchRideById } from '../api/ride';
import MapView from '../components/RideMap/MapView';
import StatsPanel from '../components/RideStats/StatsPanel';
import GalleryGrid from '../components/Gallery/GalleryGrid';
import type { Ride } from '../types/ride';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import '../styles/ride-history-styles.css';
import AppHeader from '../components/AppHeader';

type Props = { rideId: string };

export default function RideHistoryStatsPage({ rideId }: Props) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [leavingSummary, setLeavingSummary] = useState(false);
  const location = useLocation();
  const history = useHistory();
  const params = new URLSearchParams(location.search);
  const [replayMode, setReplayMode] = useState<boolean>(params.get('mode') === 'replay');
  const handleMapReady = useCallback((map: LeafletMap) => {
    setMapInstance(map);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    setReplayMode(p.get('mode') === 'replay');
  }, [location.search]);

  useEffect(() => {
    let mounted = true;
    let photoUrls: string[] = [];
    setLoading(true);
    setError(null);
    setRide(null);
    setMapInstance(null);
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

  useEffect(() => {
    if (location.pathname === `/ride-history-stats/${rideId}`) {
      setLeavingSummary(false);
      setMapInstance(null);
    }
  }, [location.pathname, rideId]);

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
        const timeout = window.setTimeout(() => {
          try {
            mapInstance.invalidateSize();
            mapInstance.fitBounds(latlngs as LatLngBoundsExpression, { padding: [40, 40] });
          } catch (e) { console.warn('fitBounds failed', e); }
        }, 300);
        return () => window.clearTimeout(timeout);
      }
      return undefined;
    } catch (e) { console.warn('fit route failed', e); }
  }, [mapInstance, ride]);

  const openReviewRoute = (path: string) => {
    // Give React Leaflet a commit to tear down its map and child layers before Ionic
    // starts the next page transition. This avoids layers attaching to a detached pane.
    setLeavingSummary(true);
    window.requestAnimationFrame(() => history.push(path));
  };
  const openReplay = () => openReviewRoute(`/ride-replay/${rideId}`);
  const hasPreviewRoute = (() => {
    if (!ride) return false;
    const geometry = ride.polylineGeoJSON.type === 'Feature'
      ? ride.polylineGeoJSON.geometry
      : ride.polylineGeoJSON;
    return geometry.type === 'LineString' && geometry.coordinates.length > 0;
  })();
  const previewReady = !hasPreviewRoute || mapInstance !== null;

  return (
    <IonPage>
      <AppHeader title={replayMode ? 'Ride replay' : 'Ride summary'} backHref="/ride-history" />
      <IonContent className="summary-screen app-page">
        {loading && <div className="screen-state" role="status">Loading ride summary…</div>}
        {!loading && error && <div className="screen-state" role="alert">Couldn’t load this ride. {error}</div>}
        {!loading && !error && !ride && <div className="screen-state" role="status">Ride not found.</div>}
        {ride && !loading && !error && <>
        <div className="ride-history-page">
          <div className="summary-heading">
            <h1>Ride complete</h1>
            <p>{new Date(ride.startTimeISO).toLocaleDateString(undefined, { dateStyle: 'full' })}</p>
            <span className="summary-ride-type">{rideId.startsWith('solo-') ? 'Solo route' : 'Shared group ride'}</span>
          </div>
          {replayMode && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, margin: '12px 12px 0 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="icon-btn primary" onClick={openReplay} aria-label="Open route replay">
                  <ReplayIcon />
                  <span>Open Replay</span>
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
                  onClick={() => openReviewRoute(`/ride-replay/${rideId}`)}
                  disabled={!previewReady}
                  aria-describedby={!previewReady ? 'summary-preview-loading' : undefined}
                  style={{ width: '100%', marginBottom: 8 }}
                >
                  Replay ride
                </button>
                <button 
                  className="rh-generate-btn" 
                  onClick={() => openReviewRoute(`/ride-history-stats/${rideId}/share`)}
                  disabled={!previewReady}
                  aria-describedby={!previewReady ? 'summary-preview-loading' : undefined}
                  style={{ width: '100%' }}
                >
                  Create Share Image
                </button>
                {!previewReady && <p id="summary-preview-loading" role="status" className="summary-preview-loading">Preparing route preview…</p>}
              </div>

              

            </div>

            <div className="rh-card rh-map">
              {leavingSummary
                ? <div className="history-map-empty" role="status">Opening ride review…</div>
                : <MapView polylineGeoJSON={ride.polylineGeoJSON} height={420} onMapReady={handleMapReady} />}
            </div>
          </div>
        </div>
        </>}
      </IonContent>
    </IonPage>
  );
}
