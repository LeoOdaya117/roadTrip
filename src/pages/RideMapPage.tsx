import {
  IonContent,
  IonIcon,
  IonPage,
  IonToast,
  IonInput,
  IonButton
} from '@ionic/react';
import { locate, pause, play, send, close, stopCircle, camera } from 'ionicons/icons';
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
import { getLastLocation, addPhoto, getSession, saveRideSession, getTrackPoints } from '../services/offlineDb';
import { useRideStore } from '../store/rideStore';
import maleAvatar from '../assets/images/default/user_male.png';
import BottomSheet from '../components/BottomSheet';

    // distance helpers (available for restoring track distance)
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
  const setSoloMode = useRideStore((state) => state.setSoloMode);
  const isSoloMode = useRideStore((state) => state.isSoloMode);

  const [fallbackCenter, setFallbackCenter] = useState(FALLBACK_CENTER);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photoToast, setPhotoToast] = useState<string | null>(null);
  const [isTogglingTracking, setIsTogglingTracking] = useState(false);
  const [topRideStatus, setTopRideStatus] = useState<'Live' | 'Paused' | 'Resuming...' | 'Pausing...' | 'Resumed'>('Live');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoNote, setPhotoNote] = useState<string>('');
  const [trackPoints, setTrackPoints] = useState<{ lat: number; lng: number }[]>([]);
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
  } = useLocationTracker(Boolean(rideId));

  useEffect(() => {
    if (routeRideId) {
      setRide(routeRideId);
      // If the route ride id indicates a solo session, ensure solo mode is enabled early
      if (routeRideId.startsWith('solo-')) {
        setSoloMode(true);
      }
    }
  }, [routeRideId, setRide]);

  useEffect(() => {
    if (rideId) {
      setTracking(true);
    }
  }, [rideId, setTracking]);

  // Ensure we request location when the page mounts so the map can show current location
  useEffect(() => {
    (async () => {
      try {
        await startTracking();
      } catch (e) {
        // ignore errors here; hook sets error state
      }
    })();

    return () => {
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

  // Keep trying while tracking is desired but GPS watch is not active yet
  // (for example when location services are turned on shortly after ride start).
  useEffect(() => {
    if (!isTracking || trackerIsTracking) {
      return;
    }

    startTracking().catch(() => undefined);
    const retryId = window.setInterval(() => {
      startTracking().catch(() => undefined);
    }, 3500);

    return () => {
      window.clearInterval(retryId);
    };
  }, [isTracking, trackerIsTracking, startTracking]);

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

    // Load existing track points for solo rides so polyline shows previous path
    (async () => {
      try {
        if (isSoloMode) {
          const pts = await getTrackPoints(rideId);
          if (pts && pts.length) {
            const mapped = pts.map((p) => ({ lat: p.lat, lng: p.lng }));
            setTrackPoints(mapped);
            // compute distance from the loaded track points to restore total distance
            try {
              let dist = 0;
              for (let i = 1; i < mapped.length; i++) {
                const a = mapped[i - 1];
                const b = mapped[i];
                const d = distanceBetween(a, b);
                if (d > 0.5) dist += d;
              }
              if (dist > 0) setDistanceMetersTotal((_) => Math.round(dist));
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore
      }
    })();

    // Restore timer and tracking state from saved session when resuming
    (async () => {
      try {
        const session = await getSession(rideId);
        if (session) {
          // compute elapsed: prefer stored durationSeconds, otherwise derive from createdAt
          let elapsed = 0;
          if (typeof session.durationSeconds === 'number' && session.durationSeconds > 0) {
            elapsed = session.durationSeconds;
          } else if (session.createdAt) {
            const created = new Date(session.createdAt).getTime();
            if (!Number.isNaN(created)) {
              elapsed = Math.max(0, Math.floor((Date.now() - created) / 1000));
            }
          }

          try {
            (rideTimer as any).setElapsed?.(elapsed);
          } catch (e) {
            // ignore
          }

          // If session is not ended, enable tracking and start timer
          if (!session.endedAt) {
            try {
              setTracking(true);
              (rideTimer as any).setRunning?.(true);
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore
      }
    })();
  }, [rideId]);

  // Persist running session progress (duration + distance) periodically so resume restores correctly
  useEffect(() => {
    if (!rideId) return;

    let stopped = false;

    const saveNow = async () => {
      if (stopped) return;
      try {
        const existing = await getSession(rideId).catch(() => undefined);
        const base = existing ?? {
          rideId,
          userId: currentUser?.id ?? 'local-user',
          userName: currentUser?.name ?? 'Me',
          isHost: currentUser?.isHost ?? false,
          isSolo: isSoloMode,
          createdAt: new Date().toISOString()
        };
        const updated = {
          ...base,
          durationSeconds: Math.max(
            elapsedRef.current,
            typeof base.durationSeconds === 'number' ? base.durationSeconds : 0
          ),
          distanceMeters: Math.round(distanceRef.current)
        };
        await saveRideSession(updated).catch(() => undefined);
      } catch (e) {
        // ignore
      }
    };

    if (isTracking) {
      saveNow();
      const id = window.setInterval(saveNow, 5000);
      return () => {
        stopped = true;
        window.clearInterval(id);
        saveNow();
      };
    }

    // if not tracking, save once
    saveNow();
    return () => { stopped = true; };
  }, [rideId, isTracking, currentUser, isSoloMode]);

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

    // Append to local trackPoints for live polyline when in solo mode
    try {
      if (isSoloMode && location) {
        setTrackPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last && Math.abs(last.lat - location.lat) < 0.000001 && Math.abs(last.lng - location.lng) < 0.000001) {
            return prev;
          }
          return [...prev, { lat: location.lat, lng: location.lng }];
        });
      }
    } catch (e) {
      // ignore
    }
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

  const elapsedRef = useRef<number>(rideTimer.elapsedSeconds);
  useEffect(() => {
    elapsedRef.current = rideTimer.elapsedSeconds;
  }, [rideTimer.elapsedSeconds]);

  const distanceRef = useRef<number>(0);
  useEffect(() => {
    distanceRef.current = distanceMetersTotal;
  }, [distanceMetersTotal]);

  const wasTrackingRef = useRef<boolean>(isTracking);
  const topStatusTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (topStatusTimeoutRef.current !== null) {
        window.clearTimeout(topStatusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (topStatusTimeoutRef.current !== null) {
      window.clearTimeout(topStatusTimeoutRef.current);
      topStatusTimeoutRef.current = null;
    }

    if (isTogglingTracking) {
      setTopRideStatus(isTracking ? 'Pausing...' : 'Resuming...');
      return;
    }

    if (!isTracking) {
      setTopRideStatus('Paused');
      wasTrackingRef.current = false;
      return;
    }

    const resumedFromPause = !wasTrackingRef.current && elapsedRef.current > 0;
    wasTrackingRef.current = true;

    if (resumedFromPause) {
      setTopRideStatus('Resumed');
      topStatusTimeoutRef.current = window.setTimeout(() => {
        setTopRideStatus('Live');
      }, 1600);
      return;
    }

    setTopRideStatus('Live');
  }, [isTracking, isTogglingTracking]);

  const topRideBadgeClass = [
    'live-badge',
    topRideStatus === 'Paused' ? 'live-badge-paused' : '',
    topRideStatus === 'Resumed' ? 'live-badge-resumed' : '',
    topRideStatus === 'Pausing...' || topRideStatus === 'Resuming...' ? 'live-badge-transition' : ''
  ].filter(Boolean).join(' ');

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
    if (isTogglingTracking) return;
    setIsTogglingTracking(true);

    if (isTracking) {
      try {
        setTracking(false);
        stopTracking();
        rideTimer.pause();
      } finally {
        setIsTogglingTracking(false);
      }
      return;
    }

    try {
      setTracking(true);
      await startTracking();
      if (rideTimer.elapsedSeconds <= 0 && !rideTimer.isRunning) {
        rideTimer.start();
      } else {
        rideTimer.resume();
      }
    } finally {
      setIsTogglingTracking(false);
    }
  };

  const handleEndRide = () => {
    console.log('[RideMapPage] handleEndRide invoked', { rideId });
    (async () => {
      try {
        stopTracking();
        setTracking(false);

        // mark session ended in db so home won't show resume
        if (rideId) {
          try {
            console.log('[RideMapPage] fetching session before ending', { rideId });
            const existing = await getSession(rideId);
            console.log('[RideMapPage] existing session', existing);
            if (existing) {
              const updated = {
                ...existing,
                endedAt: new Date().toISOString(),
                status: 'ended' as const,
                distanceMeters: Math.round(distanceMetersTotal),
                durationSeconds: Math.max(
                  Math.round(rideTimer.elapsedSeconds),
                  Math.round(elapsedRef.current),
                  typeof existing.durationSeconds === 'number' ? Math.round(existing.durationSeconds) : 0
                )
              };
              console.log('[RideMapPage] ending ride, saving session:', updated);
              await saveRideSession(updated);
              console.log('[RideMapPage] session saved');
              try {
                const verify = await getSession(rideId);
                console.log('[RideMapPage] verify saved session', verify);
              } catch (e) {
                console.error('[RideMapPage] verify read failed', e);
              }
              try {
                // mark this ride as hidden for resume (keeps record in DB for history)
                if (rideId) {
                  localStorage.setItem(`ride:hidden:${rideId}`, '1');
                  console.log('[RideMapPage] marked ride hidden from resume', { rideId });
                }
              } catch (e) {
                /* ignore */
              }
              try {
                window.dispatchEvent(new CustomEvent('ride:ended', { detail: { rideId } }));
              } catch (e) {
                /* ignore */
              }
            } else {
              console.warn('[RideMapPage] no existing session found to update', { rideId });
            }
          } catch (e) {
            console.error('[RideMapPage] error saving ended session', e);
          }
        } else {
          console.warn('[RideMapPage] no rideId present when ending ride');
        }
      } catch (err) {
        console.error('[RideMapPage] unexpected error in handleEndRide', err);
      } finally {
        try {
          // clear in-memory ride state so Home reflects no active ride
          clearRide();
        } catch (e) {
          console.error('[RideMapPage] error clearing ride state', e);
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
            trackPoints={trackPoints}
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
              <span className={topRideBadgeClass}>{topRideStatus}</span>
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
              title={isTogglingTracking ? 'Updating tracking...' : (isTracking ? 'Stopover - pause tracking' : 'Resume ride')}
              disabled={isTogglingTracking}
            >
              <IonIcon icon={isTracking ? pause : play} />
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
