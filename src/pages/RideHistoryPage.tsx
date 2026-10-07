import React, { useCallback, useEffect, useState } from 'react';
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
  IonAlert,
  IonButton,
} from '@ionic/react';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getSessionsPage, getTrackPoints, deleteSession, getPhotos } from '../services/offlineDb';
import { splitTrackSegments } from '../services/locationFilter';
import type { PhotoRecord, RideSession } from '../types/ride';
import type { TrackPoint } from '../services/offlineDb';

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
  const [filter, setFilter] = useState<'solo' | 'group'>('group');
  const [tracksByRide, setTracksByRide] = useState<Record<string, TrackPoint[]>>({});
  const [photosByRide, setPhotosByRide] = useState<Record<string, PhotoRecord[]>>({});
  const [photoUrlsByRide, setPhotoUrlsByRide] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [rideToDelete, setRideToDelete] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // create object URLs for thumbnails when photosByRide changes
  useEffect(() => {
    const urls: Record<string, string[]> = {};
    Object.keys(photosByRide).forEach((rideId) => {
      const arr = photosByRide[rideId] || [];
      urls[rideId] = arr.map((ph) => {
        try {
          return ph.thumb ? URL.createObjectURL(ph.thumb) : (ph.data ? URL.createObjectURL(ph.data) : '');
        } catch {
          return '';
        }
      });
    });
    setPhotoUrlsByRide(urls);
    return () => {
      Object.values(urls).flat().forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photosByRide]);

  // trigger a window resize when tracks are loaded so leaflet recalculates map sizes
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
    return () => clearTimeout(t);
  }, [tracksByRide]);

  // also trigger a resize when the segment filter or sessions change
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 120);
    return () => clearTimeout(t);
  }, [filter, sessions]);

  const loadPage = useCallback(async (pageToLoad: number) => {
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
  }, [hasMore]);

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const handleLoadTracks = async (rideId: string) => {
    if (tracksByRide[rideId]) return;
    const [t, p] = await Promise.all([getTrackPoints(rideId), getPhotos(rideId).catch(() => [])]);
    setTracksByRide((prev) => ({ ...prev, [rideId]: t }));
    setPhotosByRide((prev) => ({ ...prev, [rideId]: p }));
  };

  const handleDelete = async (rideId: string) => {
    await deleteSession(rideId);
    setSessions((s) => s.filter((x) => x.rideId !== rideId));
    setRideToDelete(null);
    setToast('Session deleted');
  };

  const list = sessions.filter((s) => (filter === 'solo' ? s.isSolo : !s.isSolo));

  const loadMore = async (event?: CustomEvent & { target: HTMLIonInfiniteScrollElement }) => {
    if (!hasMore) {
      await event?.target.complete();
      return;
    }
    const next = page + 1;
    await loadPage(next);
    await event?.target.complete();
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
      <IonContent className="app-page page-content history-screen">
        <div className="history-intro">
          <h1>Every ride has its people.</h1>
          <p>Find a route, revisit a photo, or see which rides you shared.</p>
        </div>
        <div className="history-screen-filter">
          <IonSegment value={filter} onIonChange={(event) => {
            if (event.detail.value === 'solo' || event.detail.value === 'group') {
              setFilter(event.detail.value);
            }
          }}>
            <IonSegmentButton value="solo">
              <IonLabel>Solo</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="group">
              <IonLabel>Group</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>

        <div className="history-list">
          {list.length === 0 && (
            <div className="history-empty">
              <h2>No {filter} rides yet</h2>
              <p>Completed rides will appear here with their route, stats, and photos.</p>
              <IonButton routerLink="/home">Start a ride</IonButton>
            </div>
          )}
          {list.map((s) => {
            const tracks = tracksByRide[s.rideId] || [];
            const first = tracks && tracks.length ? tracks[0] : undefined;
            const center = first ? [first.lat, first.lng] : [51.505, -0.09];
            return (
              <IonItemSliding key={s.rideId}>
                <IonItem button className="glass-card history-card" routerLink={`/ride-history-stats/${s.rideId}`}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div className="history-mini-map" onMouseEnter={() => handleLoadTracks(s.rideId)}>
                      <MapContainer key={`map-${s.rideId}-${(tracks && tracks.length) || 0}`} center={center as [number, number]} zoom={13} maxZoom={22} style={{ width: '100%', height: '100%' }} zoomControl={false} dragging={false} doubleClickZoom={false} touchZoom={false} scrollWheelZoom={false} attributionControl={false}>
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution="&copy; OpenStreetMap contributors"
                        />
                        {tracks && tracks.length > 1 && (
                          <>
                            {splitTrackSegments(tracks)
                              .filter((segment) => segment.length > 1)
                              .map((segment, segmentIndex) => (
                                <Polyline
                                  key={`segment-${segmentIndex}`}
                                  positions={segment.map((point) => [point.lat, point.lng])}
                                  pathOptions={{ color: '#285E7A', weight: 3 }}
                                />
                              ))}
                            <CircleMarker center={[tracks[0].lat, tracks[0].lng]} radius={5} pathOptions={{ color: '#285E7A', fillColor: '#285E7A' }} />
                            <CircleMarker center={[tracks[tracks.length - 1].lat, tracks[tracks.length - 1].lng]} radius={5} pathOptions={{ color: '#285E7A', fillColor: '#285E7A' }} />
                          </>
                        )}
                      </MapContainer>
                      <div className="history-distance-badge">{fmtDistance(s.distanceMeters)}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="history-date">{fmtDate(s.createdAt)}</div>
                          <span className="history-ride-mode">{s.isSolo ? 'Solo ride' : 'Group ride'}</span>
                          {filter !== 'solo' && (
                            <div className="history-owner">Hosted by {s.userName}</div>
                          )}
                          <div className="history-duration">
                            Duration: {fmtDuration(s.durationSeconds)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {/* buttons removed per request; row click opens Stats */}
                        </div>
                      </div>
                      {photosByRide[s.rideId] && photosByRide[s.rideId].length > 0 && (
                        <div className="history-photo-gallery" style={{ marginTop: 8 }}>
                          {photosByRide[s.rideId].slice(0, 3).map((ph, idx) => (
                            <img key={ph.id} src={photoUrlsByRide[s.rideId]?.[idx] ?? ''} className="history-photo-thumb" alt="photo" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => setRideToDelete(s.rideId)}>Delete</IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            );
          })}
          <IonInfiniteScroll threshold="100px" onIonInfinite={(event) => loadMore(event)} disabled={!hasMore || loadingMore}>
            <IonInfiniteScrollContent loadingText="Loading more sessions..." />
          </IonInfiniteScroll>
        </div>

        <IonToast isOpen={toast !== null} message={toast ?? ''} duration={1600} onDidDismiss={() => setToast(null)} />
        <IonAlert
          isOpen={rideToDelete !== null}
          header="Delete this ride?"
          message="This removes the ride session and its recorded track from this device."
          buttons={[
            { text: 'Cancel', role: 'cancel', handler: () => setRideToDelete(null) },
            { text: 'Delete', role: 'destructive', handler: () => { if (rideToDelete) void handleDelete(rideToDelete); } },
          ]}
          onDidDismiss={() => setRideToDelete(null)}
        />
      </IonContent>
    </IonPage>
  );
};

export default RideHistoryPage;
