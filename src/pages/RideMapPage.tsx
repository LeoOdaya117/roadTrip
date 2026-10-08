import {
  IonContent,
  IonIcon,
  IonPage,
  IonToast,
  IonInput,
  IonButton
} from '@ionic/react';
import { locate, pause, play, send, close, stopCircle, camera, layersOutline } from 'ionicons/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useHistory, useParams } from 'react-router-dom';
import type L from 'leaflet';
import RideMapView from '../components/RideMapView';
import { useLocationTracker } from '../hooks/useLocationTracker';
import { useRideNavigation } from '../hooks/useRideNavigation';
import { useMockRiders } from '../hooks/useMockRiders';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useRideChannel } from '../hooks/useRideChannel';
import { useRideLocationSync } from '../hooks/useRideLocationSync';
import { useRideTimer } from '../hooks/useRideTimer';
import {
  addPhoto,
  appendTrackEvent,
  getLastLocation,
  getSession,
  getTrackPoints,
  saveRideSession,
} from '../services/offlineDb';
import {
  calculateTrackDistanceMeters,
  haversineDistanceMeters,
} from '../services/locationFilter';
import type { AcceptedLocationPoint, PhotoRecord } from '../types/ride';
import { PLACE_SEARCH_ATTRIBUTION, searchPlaces, type PlaceSearchResult } from '../services/placeSearch';
import { useRideStore } from '../store/rideStore';
import maleAvatar from '../assets/images/default/user_male.png';
import streetPreview from '../assets/images/default/Map/street.png';
import osmPreview from '../assets/images/default/Map/osm.png';
import satellitePreview from '../assets/images/default/Map/satellite.png';
import darkPreview from '../assets/images/default/Map/dark.png';
import BottomSheet from '../components/BottomSheet';
import MapStyleSwitcher from '../components/MapStyleSwitcher';
import '../styles/RideMapPage.css';

const FALLBACK_CENTER = { lat: 37.7749, lng: -122.4194 };

type MapLayerOption = {
  id: string;
  label: string;
  url: string;
  attribution: string;
  previewSrc?: string;
};

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
    { id: 'fuel', label: 'Fuel Stop' },
    { id: 'help', label: 'Help' },
    { id: 'eta',  label: 'ETA' },
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
  const [showMapStyleSheet, setShowMapStyleSheet] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoNote, setPhotoNote] = useState<string>('');
  const {
    elapsedSeconds,
    isRunning: isTimerRunning,
    formatted: formattedTime,
    start: startTimer,
    pause: pauseTimer,
    resume: resumeTimer,
    reset: resetTimer,
    setElapsed,
    setRunning,
  } = useRideTimer();
  const [trackPoints, setTrackPoints] = useState<
    Array<Pick<AcceptedLocationPoint, 'lat' | 'lng' | 'segmentId' | 'timestamp'>>
  >([]);
  const captionInputRef = useRef<HTMLIonInputElement | null>(null);
  const handleCaptionChange = (event: CustomEvent<{ value?: string | null }>) => {
    try {
      const v = event.detail.value ?? '';
      console.debug('[RideMap] caption change ->', v);
      setPhotoNote(v);
    } catch {
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
    quality,
    startTracking,
    stopTracking,
    startNewSegment,
  } = useLocationTracker(false);
  const navigation = useRideNavigation(rideId, location, isTracking);
  const isAndroid = Capacitor.getPlatform() === 'android';
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [isPickingDestination, setIsPickingDestination] = useState(false);

  useEffect(() => {
    const query = placeQuery.trim();
    if (query.length < 3 || !isAndroid) {
      setPlaceResults([]);
      setIsSearchingPlaces(false);
      setPlaceSearchError(null);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsSearchingPlaces(true);
      setPlaceSearchError(null);
      void searchPlaces(query, {
        signal: controller.signal,
        bias: location ? { lat: location.lat, lng: location.lng } : undefined,
      }).then((results) => {
        setPlaceResults(results);
      }).catch((searchError: unknown) => {
        if (controller.signal.aborted) return;
        setPlaceResults([]);
        setPlaceSearchError(searchError instanceof Error ? searchError.message : 'Place search is unavailable.');
      }).finally(() => {
        if (!controller.signal.aborted) setIsSearchingPlaces(false);
      });
    }, 450);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isAndroid, location, placeQuery]);

  useEffect(() => {
    if (navigation.error) setErrorMessage(navigation.error);
  }, [navigation.error]);

  const handleSelectPlace = (place: PlaceSearchResult) => {
    setPlaceQuery('');
    setPlaceResults([]);
    setPlaceSearchError(null);
    setIsPickingDestination(false);
    void navigation.setDestination({ lat: place.lat, lng: place.lng, label: place.label });
  };

  const handleMapDestinationPick = (point: { lat: number; lng: number }) => {
    if (!isPickingDestination) return;
    setIsPickingDestination(false);
    void navigation.setDestination({
      ...point,
      label: `Map pin · ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`,
    });
  };

  useEffect(() => {
    if (routeRideId) {
      setRide(routeRideId);
      // If the route ride id indicates a solo session, ensure solo mode is enabled early
      if (routeRideId.startsWith('solo-')) {
        setSoloMode(true);
      }
    }
  }, [routeRideId, setRide, setSoloMode]);

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

    // Load the device owner's complete local track for solo and group rides.
    (async () => {
      try {
        const points = await getTrackPoints(rideId);
        if (points.length > 0) {
          setTrackPoints(points);
          setDistanceMetersTotal(
            Math.round(calculateTrackDistanceMeters(points)),
          );
        }
      } catch (loadError) {
        console.warn('[RideMapPage] failed to restore track', loadError);
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

          setElapsed?.(elapsed);

          // Only active sessions resume automatically. A stopover remains paused
          // until the rider explicitly starts a new segment.
          if (!session.endedAt) {
            const segmentId = startNewSegment(session.activeSegmentId);
            if (!session.activeSegmentId) {
              await saveRideSession({ ...session, activeSegmentId: segmentId });
            }
            if (session.status !== 'paused') {
              setTracking(true);
              setRunning?.(true);
            }
          }
        } else {
          startNewSegment();
          setTracking(true);
        }
      } catch {
        // A missing legacy session is handled as a fresh ride.
      }
    })();
  }, [rideId, setElapsed, setRunning, setTracking, startNewSegment]);

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
      } catch {
        // Progress persistence is retried on the next interval.
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

    setTrackPoints((previous) => {
      if (previous.some((point) => point.timestamp === location.timestamp)) {
        return previous;
      }
      return [...previous, location];
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

  const { syncStatus, persistenceError, pendingOutboxCount } = useRideLocationSync({
    rideId,
    riderId: currentUser?.id,
    isTracking,
    isOnline,
    isSoloMode,
    location
  });

  useEffect(() => {
    if (persistenceError) setErrorMessage(persistenceError);
  }, [persistenceError]);

  const riders = useMemo(() => Object.values(ridersMap), [ridersMap]);
  const crewMembers = useMemo(() => {
    const members = riders.map(({ id, name, avatarUrl, isHost }) => ({ id, name, avatarUrl, isHost }));
    if (currentUser && !members.some((rider) => rider.id === currentUser.id)) {
      members.unshift({
        id: currentUser.id,
        name: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
        isHost: currentUser.isHost
      });
    }
    return members;
  }, [currentUser, riders]);

  const center = location
    ? { lat: location.lat, lng: location.lng }
    : fallbackCenter;

  // Track total distance traveled in meters for the current session (local only)
  const lastLocationRef = useRef<AcceptedLocationPoint | null>(null);
  const [distanceMetersTotal, setDistanceMetersTotal] = useState<number>(0);

  

  useEffect(() => {
    if (!location) return;
    const last = lastLocationRef.current;
    if (last && last.segmentId === location.segmentId) {
      const distance = haversineDistanceMeters(last, location);
      if (distance > 0) setDistanceMetersTotal((total) => total + distance);
    }
    lastLocationRef.current = location;
  }, [location]);

  const MAP_LAYERS: MapLayerOption[] = [
    {
      id: 'carto-light',
      label: 'Street',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      previewSrc: streetPreview
    },
    {
      id: 'osm',
      label: 'OSM',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      previewSrc: osmPreview
    },
    {
      id: 'satellite',
      label: 'Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri',
      previewSrc: satellitePreview
    },
    {
      id: 'carto-dark',
      label: 'Dark',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; CARTO',
      previewSrc: darkPreview
    }
  ];

  const MAP_OVERLAYS = [
    { id: 'riders', label: 'Riders' },
    { id: 'track', label: 'Ride Path' }
  ];

  const [activeLayer, setActiveLayer] = useState(
    () => MAP_LAYERS.find((layer) => layer.id === 'osm') ?? MAP_LAYERS[0]
  );
  const [enabledOverlays, setEnabledOverlays] = useState<string[]>(['riders', 'track']);


  const elapsedRef = useRef<number>(elapsedSeconds);
  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

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

  const gpsSignal = useMemo(() => {
    if (permission === 'denied') {
      return { label: 'Denied', bars: 0 };
    }

    if (!trackerIsTracking) {
      return { label: 'Off', bars: 0 };
    }

    if (!location || quality.lastRejectedReason === 'inaccurate') {
      return { label: 'Searching', bars: 1 };
    }

    const accuracy = location.accuracy;
    if (typeof accuracy !== 'number') {
      return { label: 'Good', bars: 3 };
    }

    if (accuracy <= 8) {
      return { label: 'Excellent', bars: 4 };
    }
    if (accuracy <= 18) {
      return { label: 'Good', bars: 3 };
    }
    if (accuracy <= 35) {
      return { label: 'Fair', bars: 2 };
    }

    return { label: 'Poor', bars: 1 };
  }, [permission, quality.lastRejectedReason, trackerIsTracking, location]);

  // Auto-start timer when tracking begins, pause on stopover
  useEffect(() => {
    if (isTracking) {
      if (!isTimerRunning && elapsedSeconds === 0) {
        startTimer();
      } else if (!isTimerRunning) {
        resumeTimer();
      }
    } else {
      if (isTimerRunning) {
        pauseTimer();
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

  const handleSelectMapLayer = (layer: MapLayerOption) => {
    setActiveLayer(layer);
  };

  const handleToggleOverlay = (overlayId: string) => {
    setEnabledOverlays((prev) =>
      prev.includes(overlayId)
        ? prev.filter((id) => id !== overlayId)
        : [...prev, overlayId]
    );
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
    } catch {
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
      } satisfies PhotoRecord;
      await addPhoto(photo);
      setPhotoToast('Photo saved to this ride');
    } catch {
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
          captionInputRef.current?.setFocus();
        } catch {
          // The modal may have closed before focus runs.
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
        if (rideId) {
          if (location) {
            await appendTrackEvent(rideId, location, 'stopover');
          }
          const session = await getSession(rideId);
          if (session) {
            await saveRideSession({ ...session, status: 'paused' });
          }
        }
        pauseTimer();
      } finally {
        setIsTogglingTracking(false);
      }
      return;
    }

    try {
      const segmentId = startNewSegment();
      lastLocationRef.current = null;
      if (rideId) {
        const session = await getSession(rideId);
        if (session) {
          await saveRideSession({
            ...session,
            status: 'active',
            activeSegmentId: segmentId,
          });
        }
      }
      setTracking(true);
      await startTracking();
      if (elapsedSeconds <= 0 && !isTimerRunning) {
        startTimer();
      } else {
        resumeTimer();
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
                  Math.round(elapsedSeconds),
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
              } catch (verifyError) {
                console.error('[RideMapPage] verify read failed', verifyError);
              }
              try {
                // mark this ride as hidden for resume (keeps record in DB for history)
                if (rideId) {
                  localStorage.setItem(`ride:hidden:${rideId}`, '1');
                  console.log('[RideMapPage] marked ride hidden from resume', { rideId });
                }
              } catch {
                /* Local storage may be unavailable in privacy mode. */
              }
              try {
                window.dispatchEvent(new CustomEvent('ride:ended', { detail: { rideId } }));
              } catch {
                /* Event dispatch is best-effort during teardown. */
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
        resetTimer();
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
            currentUserAccuracy={location?.accuracy ?? null}
            navigationRoute={navigation.route}
            navigationDestination={navigation.destination}
            onDestinationPick={isPickingDestination ? handleMapDestinationPick : undefined}
            onMapReady={(map) => {
              mapRef.current = map;
            }}
            tileUrl={activeLayer.url}
            attribution={activeLayer.attribution}
            showRiders={enabledOverlays.includes('riders')}
            showTrack={enabledOverlays.includes('track')}
          />

          {isAndroid && (
            <section className="navigation-panel" aria-label="Turn-by-turn navigation">
              <label className="navigation-search-label" htmlFor="navigation-place-search">Navigate to</label>
              <div className="navigation-search-row">
                <input
                  id="navigation-place-search"
                  className="navigation-search-input"
                  type="search"
                  value={placeQuery}
                  onChange={(event) => setPlaceQuery(event.target.value)}
                  placeholder="Search a place or address"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={`navigation-pick-button${isPickingDestination ? ' is-active' : ''}`}
                  aria-pressed={isPickingDestination}
                  onClick={() => setIsPickingDestination((picking) => !picking)}
                >
                  {isPickingDestination ? 'Tap map…' : 'Pick on map'}
                </button>
              </div>
              {placeResults.length > 0 && (
                <div className="navigation-place-results" role="group" aria-label="Place search results">
                  {placeResults.map((place, index) => (
                    <button
                      type="button"
                      className="navigation-place-result"
                      key={`${place.lat}-${place.lng}-${index}`}
                      onClick={() => handleSelectPlace(place)}
                    >
                      {place.label}
                    </button>
                  ))}
                </div>
              )}
              {isSearchingPlaces && <div className="navigation-search-note" role="status">Searching places…</div>}
              {placeSearchError && <div className="navigation-search-error" role="status">{placeSearchError}</div>}
              <div className="navigation-attribution">{PLACE_SEARCH_ATTRIBUTION}</div>
              {navigation.error && (
                <div className="navigation-search-error" role="status">{navigation.error}</div>
              )}
              <div className="navigation-attribution">Routing data © OpenStreetMap contributors</div>
              {navigation.destination && (
                <div className="navigation-destination-card">
                  <div className="navigation-destination-copy">
                    <strong>{navigation.destination.label}</strong>
                    {navigation.route && (
                      <span>
                        {(navigation.route.distanceMeters / 1000).toFixed(1)} km · {Math.max(1, Math.round(navigation.route.durationSeconds / 60))} min
                      </span>
                    )}
                    {navigation.isGuiding && navigation.nextInstruction && (
                      <span className="navigation-next-turn">
                        {navigation.distanceToNextManeuverMeters != null
                          ? `${Math.round(navigation.distanceToNextManeuverMeters)} m · `
                          : ''}{navigation.nextInstruction}
                      </span>
                    )}
                    {navigation.isRouting && <span role="status">Calculating offline route…</span>}
                  </div>
                  <div className="navigation-actions">
                    <IonButton
                      size="small"
                      onClick={() => navigation.isGuiding ? navigation.stopGuidance() : void navigation.startGuidance()}
                      disabled={!navigation.supported || navigation.isRouting || !location}
                    >
                      {navigation.isGuiding ? 'Stop' : 'Start'}
                    </IonButton>
                    <IonButton size="small" fill="clear" onClick={() => void navigation.clearDestination()}>
                      Clear
                    </IonButton>
                  </div>
                </div>
              )}
              <div className="navigation-offline-note">
                {navigation.supported
                  ? 'Route calculation works offline. Map imagery and place search need internet.'
                  : 'Offline routes need the Valhalla map tiles for this area.'}
              </div>
            </section>
          )}

          {/* ── Top bar: title + live badge only ── */}
          <div className="map-top-bar">
            <span className="map-title">{isSoloMode ? 'Solo ride' : 'Group ride'}</span>
            <div style={{ marginLeft: 'auto' }}>
              <span
                className={topRideBadgeClass}
                title={
                  pendingOutboxCount > 0
                    ? `${pendingOutboxCount} track points queued for upload`
                    : syncStatus ?? undefined
                }
              >
                {topRideStatus}
                {pendingOutboxCount > 0 ? ` · ${pendingOutboxCount} queued` : ''}
              </span>
            </div>
          </div>

          {/* ── Floating action buttons top-right ── */}
          <div className="map-fabs">
            <button className="map-fab" onClick={handleCenterMap} title="Center map">
              <IonIcon icon={locate} />
            </button>
            <button
              className={`map-fab${showMapStyleSheet ? ' fab-active' : ''}`}
              onClick={() => setShowMapStyleSheet(true)}
              title="Map style"
            >
              <IonIcon icon={layersOutline} />
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
          <div className={`bottom-sheet${isSheetExpanded ? ' is-expanded' : ' is-collapsed'}`}>
            <button
              type="button"
              className="sheet-handle"
              aria-label={isSheetExpanded ? 'Collapse ride controls' : 'Expand ride controls'}
              aria-expanded={isSheetExpanded}
              onClick={() => setIsSheetExpanded((expanded) => !expanded)}
            />
            <div className="sheet-content">

              {/* Stats row */}
              <div className="sheet-stats-row">
                <div className="sheet-stat">
                  <span className="s-label">Time</span>
                  <span className={`s-value timer-value${!isTimerRunning && elapsedSeconds > 0 ? ' timer-paused' : ''}`}>
                    {formattedTime}
                  </span>
                  {!isTimerRunning && elapsedSeconds > 0 && (
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
                  <span className="s-label">GPS Status</span>
                  <span className="s-value gps-signal" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`gps-bars gps-bars-${gpsSignal.bars}`} aria-hidden="true">
                      <span className="gps-bar" />
                      <span className="gps-bar" />
                      <span className="gps-bar" />
                      <span className="gps-bar" />
                    </span>
                    <span>{gpsSignal.label}</span>
                  </span>
                </div>
              </div>

              {!isSoloMode && (
                <div className="sheet-crew-row" aria-label={`${crewMembers.length} riders in this group ride`}>
                  <div className="sheet-crew-copy">
                    <span className="sheet-crew-title">Your crew · {crewMembers.length}</span>
                    <span className="sheet-crew-caption">
                      {crewMembers.length > 1 ? 'Riders connected to this route' : 'Waiting for rider updates'}
                    </span>
                  </div>
                  <div className="sheet-crew-list">
                    {crewMembers.slice(0, 4).map((rider) => (
                      <span className="sheet-crew-avatar" key={rider.id} title={rider.name}>
                        {rider.avatarUrl ? <img src={rider.avatarUrl} alt="" /> : rider.name.slice(0, 1).toUpperCase()}
                      </span>
                    ))}
                    {crewMembers.length > 4 && <span className="sheet-crew-avatar">+{crewMembers.length - 4}</span>}
                  </div>
                </div>
              )}

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
      <BottomSheet isOpen={showMapStyleSheet} onDidDismiss={() => setShowMapStyleSheet(false)}>
        <div className="map-style-sheet-content">
          <MapStyleSwitcher
            layers={MAP_LAYERS}
            activeLayerId={activeLayer.id}
            onChange={handleSelectMapLayer}
            overlays={MAP_OVERLAYS}
            enabledOverlays={enabledOverlays}
            onToggleOverlay={handleToggleOverlay}
          />
          <div className="map-style-sheet-actions">
            <IonButton fill="clear" onClick={() => setShowMapStyleSheet(false)}>Close</IonButton>
          </div>
        </div>
      </BottomSheet>
    </IonPage>
  );
};

export default RideMapPage;
