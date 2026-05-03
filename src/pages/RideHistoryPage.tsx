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
  IonButtons,
  IonBackButton,
  IonToast,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getSessionsPage, getTrackPoints, deleteSession, deleteTrackPoints, getPhotos } from '../services/offlineDb';
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

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year} ${hh}:${mm}:${ss}`;
};

const RideHistoryPage: React.FC = () => {
  const [sessions, setSessions] = useState<RideSession[]>([]);
  const [filter, setFilter] = useState<'solo' | 'group'>('solo');
  const [tracksByRide, setTracksByRide] = useState<Record<string, any[]>>({});
  const [photosByRide, setPhotosByRide] = useState<Record<string, any[]>>({});
  const [photoUrlsByRide, setPhotoUrlsByRide] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const history = useHistory();

  useEffect(() => {
    // load first page
    loadPage(1);
    return () => {
      // revoke any created object URLs when leaving
      Object.values(photoUrlsByRide).flat().forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // create object URLs for thumbnails when photosByRide changes
  useEffect(() => {
    const urls: Record<string, string[]> = {};
    Object.keys(photosByRide).forEach((rideId) => {
      const arr = photosByRide[rideId] || [];
      urls[rideId] = arr.map((ph: any) => {
        try {
          return ph.thumb ? URL.createObjectURL(ph.thumb) : (ph.data ? URL.createObjectURL(ph.data) : '');
        } catch (e) {
          return '';
        }
      });
    });
    // revoke previous
    Object.values(photoUrlsByRide).flat().forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
    setPhotoUrlsByRide(urls);
  }, [photosByRide]);

  // trigger a window resize when tracks are loaded so leaflet recalculates map sizes
  useEffect(() => {
    const t = setTimeout(() => {
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }, 250);
    return () => clearTimeout(t);
  }, [tracksByRide]);

  // also trigger a resize when the segment filter or sessions change
  useEffect(() => {
    const t = setTimeout(() => {
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }, 120);
    return () => clearTimeout(t);
  }, [filter, sessions]);

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
      // prefetch tracks and photos for this page
      rows.forEach(async (s) => {
        const t = await getTrackPoints(s.rideId);
        setTracksByRide((prev) => ({ ...prev, [s.rideId]: t }));
        const p = await getPhotos(s.rideId).catch(() => []);
        setPhotosByRide((prev) => ({ ...prev, [s.rideId]: p }));
      });
      setHasMore(rows.length === pageSize);
      setPage(pageToLoad);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLoadTracks = async (rideId: string) => {
    if (tracksByRide[rideId]) return;
    const [t, p] = await Promise.all([getTrackPoints(rideId), getPhotos(rideId).catch(() => [])]);
    setTracksByRide((prev) => ({ ...prev, [rideId]: t }));
    setPhotosByRide((prev) => ({ ...prev, [rideId]: p }));
  };

  const handleDelete = async (rideId: string) => {
    const ok = window.confirm('Delete this session and its track points?');
    if (!ok) return;
    await deleteSession(rideId);
    await deleteTrackPoints(rideId);
    setSessions((s) => s.filter((x) => x.rideId !== rideId));
    setToast('Session deleted');
  };

  const handleOpen = async (s: RideSession) => {
    // Always open ride replay from the history list
    history.push(`/ride-replay/${s.rideId}`);
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
              <IonItemSliding key={s.rideId}>
                <IonItem button className="glass-card history-card" onClick={() => handleOpen(s)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div className="history-mini-map" onMouseEnter={() => handleLoadTracks(s.rideId)}>
                      <MapContainer key={`map-${s.rideId}-${(tracks && tracks.length) || 0}`} center={center as [number, number]} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false} dragging={false} doubleClickZoom={false} touchZoom={false} scrollWheelZoom={false} attributionControl={false}>
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
                          <div style={{ fontWeight: 800 }}>{fmtDate(s.createdAt)}</div>
                          {filter !== 'solo' && (
                            <div style={{ color: '#94A3B8', fontSize: 13 }}>{s.userName}</div>
                          )}
                          <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
                            Duration: {fmtDuration(s.durationSeconds)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div />
                        </div>
                      </div>
                      {photosByRide[s.rideId] && photosByRide[s.rideId].length > 0 && (
                        <div className="history-photo-gallery" style={{ marginTop: 8 }}>
                          {photosByRide[s.rideId].slice(0, 3).map((ph: any, idx: number) => (
                            <img key={ph.id} src={photoUrlsByRide[s.rideId]?.[idx] ?? ''} className="history-photo-thumb" alt="photo" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => handleDelete(s.rideId)}>Delete</IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
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
