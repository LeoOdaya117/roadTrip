import React, { useEffect, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonButton,
  IonButtons,
  IonBackButton,
  IonToast,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getSessionsPage, getTrackPoints, deleteSession, deleteTrackPoints } from '../services/offlineDb';
import { RideSession } from '../types/ride';

const fmtDistance = (m?: number) => {
  if (!m && m !== 0) return '—';
  return `${(m / 1000).toFixed(2)} km`;
};

const fmtDuration = (s?: number) => {
  if (!s && s !== 0) return '—';
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (hh > 0) return `${hh}h ${mm}m`;
  if (mm > 0) return `${mm}m ${ss}s`;
  return `${ss}s`;
};

const RideHistoryPage: React.FC = () => {
  const [sessions, setSessions] = useState<RideSession[]>([]);
  const [filter, setFilter] = useState<'solo' | 'group'>('solo');
  const [tracksByRide, setTracksByRide] = useState<Record<string, any[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const history = useHistory();

  useEffect(() => {
    // load first page
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPage = async (pageToLoad: number) => {
    if (!hasMore && pageToLoad !== 1) return;
    setLoadingMore(true);
    try {
      const rows = await getSessionsPage(pageToLoad, pageSize);
      if (!rows || rows.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }
      setSessions((prev) => (pageToLoad === 1 ? rows : [...prev, ...rows]));
      // prefetch tracks for this page
      rows.forEach(async (s) => {
        const t = await getTrackPoints(s.rideId);
        setTracksByRide((prev) => ({ ...prev, [s.rideId]: t }));
      });
      setHasMore(rows.length === pageSize);
      setPage(pageToLoad);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLoadTracks = async (rideId: string) => {
    if (tracksByRide[rideId]) return;
    const t = await getTrackPoints(rideId);
    setTracksByRide((prev) => ({ ...prev, [rideId]: t }));
  };

  const handleDelete = async (rideId: string) => {
    const ok = window.confirm('Delete this session and its track points?');
    if (!ok) return;
    await deleteSession(rideId);
    await deleteTrackPoints(rideId);
    setSessions((s) => s.filter((x) => x.rideId !== rideId));
    setToast('Session deleted');
  };

  const list = sessions.filter((s) => (filter === 'solo' ? s.isSolo : !s.isSolo));

  const loadMore = async (e?: any) => {
    if (!hasMore) {
      if (e && e.target) e.target.complete();
      return;
    }
    const next = page + 1;
    await loadPage(next);
    if (e && e.target) e.target.complete();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/home" />
          </IonButtons>
          <IonTitle>Ride History</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="app-page page-content">
        <div style={{ padding: '8px 0 16px' }}>
          <IonSegment value={filter} onIonChange={(e: any) => setFilter(e.detail.value)}>
            <IonSegmentButton value="solo">
              <IonLabel>Solo</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="group">
              <IonLabel>Group</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>

        <div className="history-list">
          {list.length === 0 && <p className="waiting-text">No sessions found.</p>}
          {list.map((s) => {
            const tracks = tracksByRide[s.rideId] || [];
            const first = tracks && tracks.length ? tracks[0] : undefined;
            const center = first ? [first.lat, first.lng] : [51.505, -0.09];
            return (
              <div key={s.rideId} className="glass-card history-card">
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="history-mini-map" onMouseEnter={() => handleLoadTracks(s.rideId)}>
                    <MapContainer center={center as [number, number]} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false} dragging={false} doubleClickZoom={false} touchZoom={false} scrollWheelZoom={false} attributionControl={false}>
                      <TileLayer url={'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'} />
                      {tracks && tracks.length > 1 && (
                        <>
                          <Polyline positions={tracks.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#FF6B35', weight: 3 }} />
                          <CircleMarker center={[tracks[0].lat, tracks[0].lng]} radius={5} pathOptions={{ color: '#34D399', fillColor: '#34D399' }} />
                          <CircleMarker center={[tracks[tracks.length - 1].lat, tracks[tracks.length - 1].lng]} radius={5} pathOptions={{ color: '#FB7185', fillColor: '#FB7185' }} />
                        </>
                      )}
                    </MapContainer>
                    <div className="history-distance-badge">{fmtDistance(s.distanceMeters)}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{new Date(s.createdAt).toLocaleString()}</div>
                                <div style={{ color: '#94A3B8', fontSize: 13 }}>{s.userName}</div>
                                <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
                                  Points: {(tracks && tracks.length) || 0}
                                  {(!tracks || tracks.length === 0) && ' — no track data'}
                                </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800 }}>{fmtDistance(s.distanceMeters)}</div>
                        <div style={{ color: '#94A3B8', fontSize: 13 }}>{fmtDuration(s.durationSeconds)}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <IonButton size="small" onClick={async () => {
                        // Ensure we consult the DB in real-time (mobile has no mouseenter)
                        const t = await getTrackPoints(s.rideId);
                        const has = t && t.length > 1;
                        if (has) history.push(`/ride-replay/${s.rideId}`);
                        else history.push(`/ride-map/${s.rideId}`);
                      }}>
                        Open
                      </IonButton>
                      <IonButton color="danger" size="small" fill="clear" onClick={() => handleDelete(s.rideId)}>Delete</IonButton>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <IonInfiniteScroll threshold="100px" onIonInfinite={(e) => loadMore(e)} disabled={!hasMore}>
            <IonInfiniteScrollContent loadingText="Loading more sessions..." />
          </IonInfiniteScroll>
        </div>

        <IonToast isOpen={toast !== null} message={toast ?? ''} duration={1600} onDidDismiss={() => setToast(null)} />
      </IonContent>
    </IonPage>
  );
};

export default RideHistoryPage;
