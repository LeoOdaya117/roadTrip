import {
  IonContent,
  IonIcon,
  IonPage,
  IonToast,
  IonInput,
  IonButton
} from '@ionic/react';
import { locate, pause, play, send, close, stopCircle, cafeOutline, camera } from 'ionicons/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import type L from 'leaflet';
import RideMapView from '../components/RideMapView';
import { useLocationTracker } from '../hooks/useLocationTracker';
import { useMockRiders } from '../hooks/useMockRiders';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useRideChannel } from '../hooks/useRideChannel';
import { useRideLocationSync } from '../hooks/useRideLocationSync';
import { useRideTimer } from '../hooks/useRideTimer';
import { getLastLocation, addPhoto, getSession, saveRideSession } from '../services/offlineDb';
import { useRideStore } from '../store/rideStore';
import maleAvatar from '../assets/images/default/user_male.png';
import BottomSheet from '../components/BottomSheet';

const FALLBACK_CENTER = { lat: 37.7749, lng: -122.4194 };

const RideMapPage: React.FC = () => {
  const history = useHistory();
  const { rideId: routeRideId } = useParams<{ rideId: string }>();
  const rideId = useRideStore((state) => state.rideId) ?? routeRideId;
  const setRide = useRideStore((state) => state.setRide);
  const currentUser = useRideStore((state) => state.currentUser);
  const setUser = useRideStore((state) => state.setUser);
  const clearRide = useRideStore((state) => state.clearRide);
  const ridersMap = useRideStore((state) => state.riders);
  const updateSingleRider = useRideStore((state) => state.updateSingleRider);
  const addMessage = useRideStore((state) => state.addMessage);
  const setCurrentTopic = useRideStore((state) => state.setCurrentTopic);
  const setRiderTopic = useRideStore((state) => state.setRiderTopic);
  const currentTopic = useRideStore((state) => state.currentTopic);

  const QUICK_TOPICS = [
    { id: 'fuel', label: '⛽ Fuel Stop' },
    { id: 'help', label: '🆘 Help' },
    { id: 'eta',  label: '🕐 ETA' },
  ];

  const [composeText, setComposeText] = useState('');

  const handleTopicChip = (topicId: string) => {
    setCurrentTopic(currentTopic === topicId ? null : topicId);
    setComposeText('');
  };

  const handleSendMessage = () => {
    const user = currentUser ?? { id: 'local-user', name: 'Me', isHost: false };
    if (!currentTopic || !composeText.trim()) return;
    addMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      topic: currentTopic,
      text: composeText.trim(),
      senderId: user.id,
      timestamp: new Date().toISOString(),
    });
    setRiderTopic(user.id, currentTopic, true);
    setComposeText('');
    setCurrentTopic(null);
  };
  const isTracking = useRideStore((state) => state.isTracking);
  const setTracking = useRideStore((state) => state.setTracking);
  const isSoloMode = useRideStore((state) => state.isSoloMode);

  const [fallbackCenter, setFallbackCenter] = useState(FALLBACK_CENTER);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photoToast, setPhotoToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoNote, setPhotoNote] = useState<string>('');
  const captionInputRef = useRef<any | null>(null);
  const handleCaptionChange = (e: any) => {
    try {
      const v = (e?.detail?.value ?? '');
      console.debug('[RideMap] caption change ->', v);
      setPhotoNote(v);
    } catch (err) {
      setPhotoNote('');
    }
  };
  const cameraIcon = camera;

  useEffect(() => {
    console.debug('[RideMapPage] rideId:', rideId, 'showPhotoModal:', showPhotoModal);
  }, [rideId, showPhotoModal]);

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

  // Ensure we request location when the page mounts so the map can show current location
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await startTracking();
      } catch (e) {
        // ignore errors here; hook sets error state
      }
    })();

    return () => {
      mounted = false;
      try {
        stopTracking();
      } catch (e) {
        // ignore
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!location) {
      return;
    }

    // Auto-create a local user if one was never set (e.g. direct navigation in dev)
    const user = currentUser ?? { id: 'local-user', name: 'Me', isHost: false };
    if (!currentUser) {
      setUser(user);
    }

    updateSingleRider({
      id: user.id,
      name: user.name,
      isHost: user.isHost,
      avatarUrl: (user as typeof user & { avatarUrl?: string }).avatarUrl ?? maleAvatar,
      lat: location.lat,
      lng: location.lng,
      speed: location.speed,
      timestamp: location.timestamp
    });
  }, [currentUser, location, updateSingleRider, setUser]);

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
    isSoloMode,
    location
  });

  const riders = useMemo(() => Object.values(ridersMap), [ridersMap]);

  const center = location
    ? { lat: location.lat, lng: location.lng }
    : fallbackCenter;

  // Track total distance traveled in meters for the current session (local only)
  const lastLocationRef = useRef<{ lat: number; lng: number; timestamp?: string } | null>(null);
  const [distanceMetersTotal, setDistanceMetersTotal] = useState<number>(0);

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const distanceBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const earthRadius = 6371000;
    const deltaLat = toRadians(b.lat - a.lat);
    const deltaLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const sinLat = Math.sin(deltaLat / 2);
    const sinLng = Math.sin(deltaLng / 2);

    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
  };

  useEffect(() => {
    if (!location) return;
    const last = lastLocationRef.current;
    const current = { lat: location.lat, lng: location.lng };
    if (last) {
      try {
        const d = distanceBetween(last, current);
        if (d > 0.5) {
          setDistanceMetersTotal((m) => m + d);
        }
      } catch (e) {
        // ignore
      }
    }
    lastLocationRef.current = current;
  }, [location]);

  const MAP_LAYERS = [
    {
      id: 'carto-light',
      label: 'Street',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    },
    {
      id: 'osm',
      label: 'OSM',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors'
    },
    {
      id: 'satellite',
      label: 'Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri'
    },
    {
      id: 'carto-dark',
      label: 'Dark',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; CARTO'
    }
  ];

  const [activeLayer, setActiveLayer] = useState(MAP_LAYERS[0]);

  const rideTimer = useRideTimer();

  // Auto-start timer when tracking begins, pause on stopover
  useEffect(() => {
    if (isTracking) {
      if (!rideTimer.isRunning && rideTimer.elapsedSeconds === 0) {
        rideTimer.start();
      } else if (!rideTimer.isRunning) {
        rideTimer.resume();
      }
    } else {
      if (rideTimer.isRunning) {
        rideTimer.pause();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking]);

  useMockRiders({
    enabled: false,
    origin: center
  });

  const handleCenterMap = () => {
    if (mapRef.current) {
      mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom() ?? 15);
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewDataUrl(reader.result as string);
        setShowPhotoModal(true);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setPhotoToast('Failed to read image');
      if (e.target) e.target.value = '';
    }
  };

  const readImageAndResize = (dataUrl: string, maxWidth: number, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height || 1;
        const width = Math.min(maxWidth, img.width);
        const height = Math.round(width / ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Failed to create blob'));
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = (err) => reject(err);
      img.src = dataUrl;
    });
  };

  const handleSavePhoto = async () => {
    if (!previewDataUrl) return;
    try {
      // generate full and thumbnail blobs
      const full = await readImageAndResize(previewDataUrl, 1200, 0.85);
      const thumb = await readImageAndResize(previewDataUrl, 320, 0.7);
      const photo = {
        rideId: rideId ?? `unsynced-${Date.now()}`,
        data: full,
        thumb,
        lat: location?.lat,
        lng: location?.lng,
        timestamp: new Date().toISOString(),
        note: photoNote || undefined
      } as any;
      await addPhoto(photo);
      setPhotoToast('Photo saved to this ride');
    } catch (err) {
      setPhotoToast('Failed to save photo');
    } finally {
      setShowPhotoModal(false);
      setPreviewDataUrl(null);
      setPhotoNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (showPhotoModal) {
      // focus the caption input after sheet opens
      setTimeout(() => {
        try {
          (captionInputRef.current as any)?.setFocus?.();
        } catch (e) {
          // ignore
        }
      }, 220);
    }
  }, [showPhotoModal]);

  const handleToggleTracking = async () => {
    if (isTracking) {
      stopTracking();
      setTracking(false);
      rideTimer.pause();
      return;
    }

    await startTracking();
    setTracking(true);
    rideTimer.resume();
  };

  const handleEndRide = () => {
    (async () => {
      try {
        stopTracking();
        setTracking(false);
        // mark session ended in db so home won't show resume
        if (rideId) {
          try {
            const existing = await getSession(rideId);
            if (existing) {
              const updated = {
                ...existing,
                endedAt: new Date().toISOString(),
                distanceMeters: Math.round(distanceMetersTotal),
                durationSeconds: Math.round(rideTimer.elapsedSeconds)
              };
              await saveRideSession(updated);
            }
          } catch (e) {
            // ignore db errors
          }
        }
      } finally {
        try {
          // clear in-memory ride state so Home reflects no active ride
          clearRide();
        } catch (e) {
          // ignore
        }
        rideTimer.reset();
        history.push('/home');
      }
    })();
  };

  return (
    <IonPage>
      <IonContent className="ride-map-content app-page" fullscreen scrollY={false}>
        <div className="map-wrapper">
          <RideMapView
            center={center}
            riders={riders}
            currentUserId={currentUser?.id}
            onMapReady={(map) => {
              mapRef.current = map;
            }}
            tileUrl={activeLayer.url}
            attribution={activeLayer.attribution}
          />

          {/* ── Top bar: title + live badge only ── */}
          <div className="map-top-bar">
            <span className="map-title">Live Ride</span>
            <div style={{ marginLeft: 'auto' }}>
              <span className="live-badge">Live</span>
            </div>
          </div>

          {/* ── Floating action buttons top-right ── */}
          <div className="map-fabs">
            <button className="map-fab" onClick={handleCenterMap} title="Center map">
              <IonIcon icon={locate} />
            </button>
            <button className="map-fab" onClick={handlePhotoClick} title="Add photo">
              <IonIcon icon={cameraIcon} />
            </button>
            <button
              className={`map-fab${!isTracking ? ' fab-stopover' : ''}`}
              onClick={handleToggleTracking}
              title={isTracking ? 'Stopover — pause tracking' : 'Resume ride'}
            >
              <IonIcon icon={isTracking ? cafeOutline : play} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          {/* ── Bottom sheet ── */}
          <div className="bottom-sheet">
            <div className="sheet-handle" />
            <div className="sheet-content">

              {/* Stats row */}
              <div className="sheet-stats-row">
                <div className="sheet-stat">
                  <span className="s-label">Time</span>
                  <span className={`s-value timer-value${!rideTimer.isRunning && rideTimer.elapsedSeconds > 0 ? ' timer-paused' : ''}`}>
                    {rideTimer.formatted}
                  </span>
                  {!rideTimer.isRunning && rideTimer.elapsedSeconds > 0 && (
                    <span className="s-stopover-pill">Stopover</span>
                  )}
                </div>
                <div className="sheet-stat-sep" />
                <div className="sheet-stat">
                  <span className="s-label">Speed</span>
                  <span className="s-value">
                    {location?.speed != null ? `${Math.round((location.speed ?? 0) * 3.6)}` : '—'}
                    {location?.speed != null && <span className="s-unit"> km/h</span>}
                  </span>
                </div>
                <div className="sheet-stat-sep" />
                <div className="sheet-stat">
                  <span className="s-label">Distance</span>
                  <span className="s-value">
                    {(distanceMetersTotal / 1000).toFixed(2)}
                    <span className="s-unit"> km</span>
                  </span>
                </div>
                <div className="sheet-stat-sep" />
                <div className="sheet-stat">
                  <span className="s-label">Status</span>
                  <span className="s-value" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Layer selector row */}
              <div className="sheet-section-label">Map Style</div>
              <div className="sheet-chips-row">
                {MAP_LAYERS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setActiveLayer(l)}
                    className={activeLayer.id === l.id ? 'chip chip-active' : 'chip'}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              {/* Topics row */}
              <div className="sheet-section-label">Quick Message</div>
              <div className="sheet-chips-row">
                {QUICK_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTopicChip(t.id)}
                    className={`chip chip-topic${currentTopic === t.id ? ' chip-topic-active' : ''}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Inline compose panel */}
              {currentTopic && (
                <div className="sheet-compose">
                  <div className="sheet-compose-label">
                    {QUICK_TOPICS.find(t => t.id === currentTopic)?.label}
                  </div>
                  <div className="sheet-compose-row">
                    <input
                      className="sheet-compose-input"
                      placeholder="Type a message…"
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button className="sheet-compose-send" onClick={handleSendMessage}>
                      <IonIcon icon={send} />
                    </button>
                    <button className="sheet-compose-close" onClick={() => { setCurrentTopic(null); setComposeText(''); }}>
                      <IonIcon icon={close} />
                    </button>
                  </div>
                </div>
              )}

              {/* End ride */}
              <button className="btn-end-ride" onClick={handleEndRide}>
                <IonIcon icon={stopCircle} />
                End Ride
              </button>

            </div>
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
      <IonToast
        isOpen={photoToast !== null}
        message={photoToast ?? ''}
        color="primary"
        duration={1800}
        onDidDismiss={() => setPhotoToast(null)}
      />
      <BottomSheet isOpen={showPhotoModal} centered={true} onDidDismiss={() => { console.debug('[RideMapPage] BottomSheet onDidDismiss'); setShowPhotoModal(false); }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 120, height: 90, overflow: 'hidden', borderRadius: 8 }}>
            {previewDataUrl && <img src={previewDataUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Save photo</div>
              <IonInput ref={captionInputRef} placeholder="Add a note or caption" value={photoNote ?? ''} onIonChange={handleCaptionChange} />
            </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }} className="btn-row">
          <IonButton className="cancel" fill="clear" onClick={() => { setShowPhotoModal(false); setPreviewDataUrl(null); setPhotoNote(''); }}>Cancel</IonButton>
          <IonButton className="save" onClick={handleSavePhoto}>Save</IonButton>
        </div>
      </BottomSheet>
    </IonPage>
  );
};

export default RideMapPage;
