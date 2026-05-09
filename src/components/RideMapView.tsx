import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../services/leafletConfig';
import RiderMarker from './RiderMarker';
import { Rider } from '../types/ride';
import type L from 'leaflet';

type RideMapViewProps = {
  center: { lat: number; lng: number };
  riders: Rider[];
  trackPoints?: { lat: number; lng: number }[];
  currentUserId?: string;
  currentUserAccuracy?: number | null;
  onMapReady?: (map: L.Map) => void;
  tileUrl?: string;
  attribution?: string;
  labelsTileUrl?: string;
  labelsAttribution?: string;
  showRiders?: boolean;
  showTrack?: boolean;
};

const MapReadyHandler = ({ onReady }: { onReady?: (map: L.Map) => void }) => {
  const map = useMap();

  useEffect(() => {
    if (onReady) {
      onReady(map);
    }

    // Sometimes Leaflet needs an explicit invalidateSize when the container
    // becomes visible or its layout changes (Ionic containers, overlays).
    const t1 = setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* ignore */ }
    }, 120);

    // Second pass for cases where Ionic finishes layout after a longer delay
    const t2 = setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* ignore */ }
    }, 600);

    const onResize = () => {
      try {
        map.invalidateSize();
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', onResize);
    };
  }, [map, onReady]);

  return null;
};

const RideMapView = ({
  center,
  riders,
  trackPoints,
  currentUserId,
  currentUserAccuracy,
  onMapReady,
  tileUrl,
  attribution,
  labelsTileUrl,
  labelsAttribution,
  showRiders = true,
  showTrack = true
}: RideMapViewProps) => {
  const markers = useMemo(
    () =>
      riders.map((rider) => (
        <RiderMarker
          key={rider.id}
          rider={rider}
          isCurrentUser={rider.id === currentUserId}
          accuracy={rider.id === currentUserId ? currentUserAccuracy ?? null : null}
        />
      )),
    [riders, currentUserId, currentUserAccuracy]
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      maxZoom={22}
      className="map-container"
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        key={tileUrl ?? 'default'}
        attribution={attribution ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'}
        url={tileUrl ?? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'}
      />
      {labelsTileUrl && (
        <TileLayer
          key={`labels-${labelsTileUrl}`}
          attribution={labelsAttribution ?? ''}
          url={labelsTileUrl}
          pane="overlayPane"
        />
      )}
      <MapReadyHandler onReady={onMapReady} />
      {showRiders ? markers : null}
      {showTrack && trackPoints && trackPoints.length > 1 && (
        <>
          {/* subtle shadow for contrast */}
          <Polyline
            positions={trackPoints.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: 'rgba(0,0,0,0.14)', weight: 6, opacity: 1, lineCap: 'round' }}
          />
          <Polyline
            positions={trackPoints.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#ff6b2d', weight: 3, opacity: 0.72, lineCap: 'round' }}
          />
        </>
      )}
    </MapContainer>
  );
};

export default RideMapView;
