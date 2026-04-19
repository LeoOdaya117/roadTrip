import React, { useEffect, useRef, useState } from 'react';
import { useIonViewDidEnter } from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonRange,
  IonIcon
} from '@ionic/react';
import { play, pause, playSkipBack, playSkipForward } from 'ionicons/icons';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getTrackPoints, getSession } from '../services/offlineDb';

const RideReplayPage: React.FC = () => {
  const { rideId } = useParams<{ rideId: string }>();
  const history = useHistory();
  const [points, setPoints] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // playback speed multiplier (1x default). Higher = faster playback
  const [speedFactor, setSpeedFactor] = useState(1);
  const timerRef = useRef<number | null>(null);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const mapRef = useRef<any | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!rideId) return;
    (async () => {
      const t = await getTrackPoints(rideId);
      setPoints(t || []);
      const s = await getSession(rideId);
      setSessionLabel(s ? `${s.userName} • ${new Date(s.createdAt).toLocaleString()}` : rideId);
      // ensure map will mount after we have session info
      // (if view already entered, mapReady may be true)
      // small delay helps Ionic finish layout before Leaflet mounts
      setTimeout(() => setMapReady(true), 80);
    })();
  }, [rideId]);

  // Schedule playback respecting original timestamps
  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current as unknown as number);
        timerRef.current = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (!playing) return;
      if (!points || points.length === 0) return;
      if (index >= points.length - 1) {
        setPlaying(false);
        return;
      }
      const cur = points[index];
      const next = points[index + 1];
      const tCur = cur && cur.timestamp ? Date.parse(cur.timestamp) : null;
      const tNext = next && next.timestamp ? Date.parse(next.timestamp) : null;
      // Compute raw delay from timestamps (ms). If timestamps missing, use default.
      let delay = 1000;
      if (tCur !== null && tNext !== null && !Number.isNaN(tCur) && !Number.isNaN(tNext)) {
        delay = Math.max(50, tNext - tCur);
      }
      // Adjust by speed factor, but cap the resulting step to avoid very long waits
      // for sparse data. This keeps playback responsive even for long gaps.
      const raw = Math.round(delay / Math.max(0.01, speedFactor));
      const MIN_STEP = 20; // never below 20ms
      const MAX_STEP = 800; // cap long gaps to 800ms per step
      const adjusted = Math.max(MIN_STEP, Math.min(raw, MAX_STEP));
      timerRef.current = window.setTimeout(() => {
        setIndex((i) => Math.min(points.length - 1, i + 1));
      }, adjusted) as unknown as number;
    };

    // Whenever playing, points, index, or speedFactor change, (re)schedule
    scheduleNext();

    return () => clearTimer();
  }, [playing, points, index, speedFactor]);

  // Ensure we never use an out-of-range index when points change
  useEffect(() => {
    if (!points || points.length === 0) {
      setIndex(0);
      setPlaying(false);
      return;
    }
    if (index >= points.length) {
      setIndex(points.length - 1);
    }
  }, [points]);

  const safeIndex = points && points.length ? Math.min(index, points.length - 1) : 0;
  const current = points && points.length ? points[safeIndex] : null;
  const center: [number, number] = current ? [current.lat, current.lng] : [51.505, -0.09];

  useEffect(() => {
    if (mapRef.current && current) {
      try {
        // Avoid animated pans on each frame for snappier playback
        try {
          mapRef.current.setView([current.lat, current.lng], mapRef.current.getZoom() ?? 13, { animate: false });
        } catch (e) {
          // fallback to panTo if setView options unsupported
          try { mapRef.current.panTo([current.lat, current.lng], { animate: false }); } catch (err) { }
        }
      } catch (e) {
        // ignore
      }
    }
  }, [current]);

  // Ensure Leaflet recalculates size and fit bounds after Map creation / when points load.
  // Call invalidateSize multiple times and via RAF to handle Ionic layout transitions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const doInvalidate = () => {
      try {
        // try immediate invalidate
        map.invalidateSize();
      } catch (e) {
        // ignore
      }
      // extra RAF invalidation helps when the container has just been laid out
      requestAnimationFrame(() => {
        try { map.invalidateSize(); } catch (e) { }
      });
    };

    doInvalidate();

    const timers: number[] = [];
    timers.push(window.setTimeout(doInvalidate, 80));
    timers.push(window.setTimeout(doInvalidate, 250));
    timers.push(window.setTimeout(doInvalidate, 700));

    if (points && points.length > 1) {
      try {
        const latlngs = points.map((p: any) => [p.lat, p.lng]);
        map.fitBounds(latlngs, { padding: [20, 20] });
      } catch (e) { /* ignore */ }
    }

    return () => { timers.forEach((t) => clearTimeout(t)); };
  }, [points]);

  // Ensure map invalidation when the Ionic view fully enters (fixes clipped tiles after transitions)
  useIonViewDidEnter(() => {
    const map = mapRef.current;
    if (!map) return;
    const doInvalidate = () => {
      try { map.invalidateSize && map.invalidateSize(); } catch (e) { }
      try { map.invalidateSize && map.invalidateSize(true); } catch (e) { }
      requestAnimationFrame(() => {
        try { map.invalidateSize && map.invalidateSize(); } catch (e) { }
      });
    };

    doInvalidate();
    const ids: number[] = [];
    ids.push(window.setTimeout(doInvalidate, 120));
    ids.push(window.setTimeout(doInvalidate, 300));
    ids.push(window.setTimeout(doInvalidate, 800));

    if (points && points.length > 1) {
      try {
        const latlngs = points.map((p: any) => [p.lat, p.lng]);
        map.fitBounds(latlngs, { padding: [20, 20] });
      } catch (e) { }
    }

    return () => ids.forEach((i) => clearTimeout(i));
  });

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/ride-history" />
          </IonButtons>
          <IonTitle>Replay</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="app-page page-content">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800 }}>{sessionLabel}</div>
          {(!points || points.length === 0) && (
            <div style={{ marginTop: 8, color: '#94A3B8' }}>No recorded track points available for this session.</div>
          )}
        </div>

        <div style={{ height: 320, borderRadius: 12, overflow: 'hidden' }}>
          {mapReady && (
            <MapContainer whenCreated={(m) => { mapRef.current = m; try { m.invalidateSize(); } catch (e) { } }} center={center} zoom={13} style={{ width: '100%', height: '100%' }}>
            
            <TileLayer url={'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'} />
            {points && points.length > 0 && (
              <>
                <Polyline positions={points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#FF6B35', weight: 3, opacity: 0.9 }} />
                {points[0] && <CircleMarker center={[points[0].lat, points[0].lng]} radius={5} pathOptions={{ color: '#34D399', fillColor: '#34D399' }} />}
                {points[points.length - 1] && <CircleMarker center={[points[points.length - 1].lat, points[points.length - 1].lng]} radius={5} pathOptions={{ color: '#FB7185', fillColor: '#FB7185' }} />}
                {current && (
                  <CircleMarker center={[current.lat, current.lng]} radius={8} pathOptions={{ color: '#FF6B35', fillColor: '#FF6B35' }} />
                )}
              </>
            )}
          </MapContainer>
          )}
          
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <IonButton onClick={() => { setIndex(0); setPlaying(false); }} disabled={points.length === 0}>
            <IonIcon icon={playSkipBack} />
          </IonButton>
          <IonButton onClick={() => setPlaying((p) => !p)} disabled={points.length === 0}>
            <IonIcon icon={playing ? pause : play} />
          </IonButton>
          <IonButton onClick={() => setIndex((i) => Math.min(points.length - 1, i + 1))} disabled={points.length === 0}>
            <IonIcon icon={playSkipForward} />
          </IonButton>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6 }}>Playback speed: {speedFactor}x</div>
            <IonRange min={0.25} max={4} step={0.25} value={speedFactor} onIonChange={(e: any) => setSpeedFactor(e.detail.value)}>
            </IonRange>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <IonRange min={0} max={Math.max(0, points.length - 1)} step={1} value={safeIndex} onIonChange={(e: any) => { setIndex(e.detail.value); }}>
          </IonRange>
          <div style={{ marginTop: 6 }}>{points.length === 0 ? '0 / 0' : `${safeIndex + 1} / ${points.length}`}</div>
        </div>

      </IonContent>
    </IonPage>
  );
};

export default RideReplayPage;
