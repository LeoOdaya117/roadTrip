import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  IonPage,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
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
import AppHeader from '../components/AppHeader';

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
  if (Number.isNaN(d.getTime())) return 'Date unavailable';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const RideHistoryPage: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const [sessions, setSessions] = useState<RideSession[]>([]);
  const [filter, setFilter] = useState<'solo' | 'group'>('group');
  const [tracksByRide, setTracksByRide] = useState<Record<string, TrackPoint[]>>({});
  const [photosByRide, setPhotosByRide] = useState<Record<string, PhotoRecord[]>>({});
  const [photoUrlsByRide, setPhotoUrlsByRide] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [rideToDelete, setRideToDelete] = useState<string | null>(null);
  const rideToDeleteRef = useRef<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [pageError, setPageError] = useState<{ page: number; message: string } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, { track?: string; photos?: string }>>({});
  const [deletingRideId, setDeletingRideId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ rideId: string; message: string } | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [openingSummary, setOpeningSummary] = useState(false);
  const pageRequestInFlight = useRef(false);

  useEffect(() => {
    if (location.pathname === '/ride-history') setOpeningSummary(false);
  }, [location.pathname]);

  const openSummary = (rideId: string) => {
    // Tear down mini-map layers before the Ionic route transition swaps pages.
    setOpeningSummary(true);
    window.requestAnimationFrame(() => history.push(`/ride-history-stats/${rideId}`));
  };

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

  const loadRideDetails = useCallback(async (rideId: string) => {
    setLoadingDetails((previous) => ({ ...previous, [rideId]: true }));
    setDetailErrors((previous) => {
      const next = { ...previous };
      delete next[rideId];
      return next;
    });
    const [trackResult, photosResult] = await Promise.allSettled([
      getTrackPoints(rideId),
      getPhotos(rideId),
    ]);
    if (trackResult.status === 'fulfilled') {
      setTracksByRide((previous) => ({ ...previous, [rideId]: trackResult.value }));
    }
    if (photosResult.status === 'fulfilled') {
      setPhotosByRide((previous) => ({ ...previous, [rideId]: photosResult.value }));
    }
    if (trackResult.status === 'rejected' || photosResult.status === 'rejected') {
      setDetailErrors((previous) => ({
        ...previous,
        [rideId]: {
          ...(trackResult.status === 'rejected' && { track: 'Could not load this route preview.' }),
          ...(photosResult.status === 'rejected' && { photos: 'Could not load ride photos.' }),
        },
      }));
    }
    setLoadingDetails((previous) => ({ ...previous, [rideId]: false }));
  }, []);

  const loadPage = useCallback(async (pageToLoad: number) => {
    if (pageRequestInFlight.current) return;
    pageRequestInFlight.current = true;
    setPageError(null);
    if (pageToLoad === 1) setLoadingInitial(true);
    else setLoadingMore(true);
    try {
      const rows = await getSessionsPage(pageToLoad, pageSize);
      if (!rows || rows.length === 0) {
        if (pageToLoad === 1) setSessions([]);
        setHasMore(false);
        setPage(pageToLoad);
        return;
      }
      setSessions((prev) => (pageToLoad === 1 ? rows : [...prev, ...rows]));
      rows.forEach((session) => { void loadRideDetails(session.rideId); });
      setHasMore(rows.length === pageSize);
      setPage(pageToLoad);
    } catch (error) {
      setPageError({
        page: pageToLoad,
        message: error instanceof Error ? error.message : 'Ride history could not be loaded.',
      });
    } finally {
      pageRequestInFlight.current = false;
      setLoadingInitial(false);
      setLoadingMore(false);
    }
  }, [loadRideDetails]);

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const handleLoadTracks = async (rideId: string) => loadRideDetails(rideId);

  const handleDelete = async (rideId: string) => {
    setDeletingRideId(rideId);
    setDeleteError(null);
    try {
      await deleteSession(rideId);
      setSessions((s) => s.filter((x) => x.rideId !== rideId));
      setTracksByRide((previous) => { const next = { ...previous }; delete next[rideId]; return next; });
      setPhotosByRide((previous) => { const next = { ...previous }; delete next[rideId]; return next; });
      setDetailErrors((previous) => { const next = { ...previous }; delete next[rideId]; return next; });
      setRideToDelete(null);
      setToast('Session deleted');
    } catch (error) {
      setRideToDelete(null);
      setDeleteError({
        rideId,
        message: error instanceof Error ? error.message : 'The ride could not be deleted.',
      });
    } finally {
      setDeletingRideId(null);
    }
  };

  const finishDeleteAlert = (role?: string) => {
    const selectedRideId = rideToDeleteRef.current;
    rideToDeleteRef.current = null;
    setRideToDelete(null);
    if (role === 'destructive' && selectedRideId) void handleDelete(selectedRideId);
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
      <AppHeader title="Ride History" backHref="/home" />
      <IonContent className="app-page page-content history-screen">
        <div className="history-intro">
          <h1>Your rides</h1>
          <p>Miles worth remembering · saved on this device</p>
        </div>
        <div className="history-screen-filter">
          <IonSegment aria-label="Filter ride history" value={filter} onIonChange={(event) => {
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
          {pageError && (
            <div className="history-empty" role="alert">
              <h2>{pageError.page === 1 ? 'Couldn’t load ride history' : 'Couldn’t load more rides'}</h2>
              <p>{pageError.message}</p>
              <IonButton onClick={() => void loadPage(pageError.page)}>
                {pageError.page === 1 ? 'Retry loading rides' : `Retry page ${pageError.page}`}
              </IonButton>
            </div>
          )}
          {loadingInitial && <div className="history-empty" role="status">Loading your rides…</div>}
          {!loadingInitial && !pageError && list.length === 0 && (
            <div className="history-empty" role="status">
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
                <IonItem button className="glass-card history-card" data-ride-id={s.rideId} onClick={() => openSummary(s.rideId)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div className="history-mini-map" aria-hidden="true" onMouseEnter={() => { if (!tracksByRide[s.rideId]) void handleLoadTracks(s.rideId); }}>
                      {tracks.length > 1 ? openingSummary ? <div className="history-map-empty" role="status">Opening ride summary…</div> : <MapContainer key={`map-${s.rideId}-${tracks.length}`} center={center as [number, number]} zoom={13} maxZoom={22} style={{ width: '100%', height: '100%' }} zoomControl={false} dragging={false} doubleClickZoom={false} touchZoom={false} scrollWheelZoom={false}>
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution="&copy; OpenStreetMap contributors"
                        />
                        {tracks.length > 1 && (
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
                      </MapContainer> : <div className="history-map-empty">No route recorded</div>}
                      <div className="history-distance-badge">{fmtDistance(s.distanceMeters)}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      {loadingDetails[s.rideId] && <div role="status">Loading route and photos…</div>}
                      {detailErrors[s.rideId]?.track && (
                        <div role="alert">
                          <span>{detailErrors[s.rideId].track}</span>{' '}
                          <IonButton fill="clear" onClick={(event) => { event.stopPropagation(); void loadRideDetails(s.rideId); }}>Retry route</IonButton>
                        </div>
                      )}
                      {detailErrors[s.rideId]?.photos && (
                        <div role="alert">
                          <span>{detailErrors[s.rideId].photos}</span>{' '}
                          <IonButton fill="clear" onClick={(event) => { event.stopPropagation(); void loadRideDetails(s.rideId); }}>Retry photos</IonButton>
                        </div>
                      )}
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
                            <img key={ph.id} src={photoUrlsByRide[s.rideId]?.[idx] ?? ''} className="history-photo-thumb" alt={`Ride photo ${idx + 1}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </IonItem>
                {deleteError?.rideId === s.rideId && (
                  <div role="alert" className="history-delete-error">
                    <span>Couldn’t delete this ride. {deleteError.message}</span>{' '}
                    <IonButton fill="clear" disabled={deletingRideId === s.rideId} onClick={() => void handleDelete(s.rideId)}>
                      {deletingRideId === s.rideId ? 'Deleting…' : 'Retry delete'}
                    </IonButton>
                  </div>
                )}
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => {
                    rideToDeleteRef.current = s.rideId;
                    setRideToDelete(s.rideId);
                  }} aria-label={`Delete ride from ${fmtDate(s.createdAt)}`}>
                    Delete ride
                  </IonItemOption>
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
          key={rideToDelete ?? 'closed'}
          isOpen={rideToDelete !== null}
          header="Delete this ride?"
          message={deletingRideId ? 'Deleting ride…' : 'This permanently removes the ride session, recorded track, and ride photos from this device.'}
          buttons={[
            { text: 'Cancel', role: 'cancel', handler: () => finishDeleteAlert('cancel') },
            { text: 'Delete ride', role: 'destructive', handler: () => finishDeleteAlert('destructive') },
          ]}
          onDidDismiss={(event) => finishDeleteAlert(event.detail.role)}
        />
      </IonContent>
    </IonPage>
  );
};

export default RideHistoryPage;
