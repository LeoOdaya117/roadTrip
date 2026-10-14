import { Fragment, useEffect, useMemo, useRef } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../services/leafletConfig';
import RiderMarker from './RiderMarker';
import type { MapMarkerStyle, NavigationDestination, NavigationRoute, Rider } from '../types/ride';
import type L from 'leaflet';

type RideMapViewProps = {
  center: { lat: number; lng: number };
  initialLocation?: { lat: number; lng: number } | null;
  resetKey?: string;
  riders: Rider[];
  trackPoints?: { lat: number; lng: number; segmentId?: string }[];
  currentUserId?: string;
  currentUserAccuracy?: number | null;
  currentUserMarkerStyle?: MapMarkerStyle;
  followEnabled?: boolean;
  followLocation?: { lat: number; lng: number } | null;
  onFollowInterrupted?: () => void;
  onMapReady?: (map: L.Map) => void;
  tileUrl?: string;
  attribution?: string;
  labelsTileUrl?: string;
  labelsAttribution?: string;
  showRiders?: boolean;
  showTrack?: boolean;
  navigationRoute?: NavigationRoute | null;
  navigationDestination?: NavigationDestination | null;
  onDestinationPick?: (point: { lat: number; lng: number }) => void;
};

const DestinationPickHandler = ({ onPick }: { onPick?: (point: { lat: number; lng: number }) => void }) => {
  useMapEvents({
    click: (event) => onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
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
      try { map.invalidateSize(); } catch { /* Leaflet may be detaching. */ }
    }, 120);

    // Second pass for cases where Ionic finishes layout after a longer delay
    const t2 = setTimeout(() => {
      try { map.invalidateSize(); } catch { /* Leaflet may be detaching. */ }
    }, 600);

    const onResize = () => {
      try {
        map.invalidateSize();
      } catch {
        // Leaflet may be detaching while the resize event is delivered.
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

const InitialLocationHandler = ({
  location,
  resetKey,
}: {
  location?: { lat: number; lng: number } | null;
  resetKey?: string;
}) => {
  const map = useMap();
  const centering = useRef({ resetKey, centered: false });
  const latitude = location?.lat;
  const longitude = location?.lng;

  useEffect(() => {
    if (centering.current.resetKey !== resetKey) {
      centering.current = { resetKey, centered: false };
    }
    if (centering.current.centered || latitude === undefined || longitude === undefined) return;
    map.setView([latitude, longitude], map.getZoom(), { animate: false });
    centering.current.centered = true;
  }, [map, latitude, longitude, resetKey]);

  return null;
};

const FollowLocationHandler = ({
  location,
  followEnabled = false,
  onInterrupted,
}: {
  followEnabled?: boolean;
  location?: { lat: number; lng: number } | null;
  onInterrupted?: () => void;
}) => {
  const map = useMap();
  const latitude = location?.lat;
  const longitude = location?.lng;
  const eventHandlers = useMemo(
    () => ({ dragstart: () => { if (followEnabled) onInterrupted?.(); } }),
    [followEnabled, onInterrupted],
  );

  useEffect(() => {
    if (!followEnabled || latitude === undefined || longitude === undefined) return;
    // Follow means the same exact center as the one-shot location button.
    // Enabling it must recenter even when the rider's coordinate is unchanged.
    map.setView([latitude, longitude], map.getZoom(), { animate: false });
  }, [map, latitude, longitude, followEnabled]);

  useMapEvents(eventHandlers);

  return null;
};

const RideMapView = ({
  center,
  initialLocation,
  resetKey,
  riders,
  trackPoints,
  currentUserId,
  currentUserAccuracy,
  currentUserMarkerStyle = 'circle',
  followEnabled = false,
  followLocation,
  onFollowInterrupted,
  onMapReady,
  tileUrl,
  attribution,
  labelsTileUrl,
  labelsAttribution,
  showRiders = true,
  showTrack = true,
  navigationRoute,
  navigationDestination,
  onDestinationPick,
}: RideMapViewProps) => {
  const markers = useMemo(
    () =>
      riders.map((rider) => (
        <RiderMarker
          key={rider.id}
          rider={rider}
          isCurrentUser={rider.id === currentUserId}
          accuracy={rider.id === currentUserId ? currentUserAccuracy ?? null : null}
          markerStyle={rider.id === currentUserId ? currentUserMarkerStyle : 'circle'}
        />
      )),
    [riders, currentUserId, currentUserAccuracy, currentUserMarkerStyle]
  );

  const trackSegments = useMemo(() => {
    const segments: Array<Array<{ lat: number; lng: number }>> = [];
    let previousPoint: { segmentId?: string } | undefined;
    for (const point of trackPoints ?? []) {
      if (
        segments.length === 0 ||
        (previousPoint?.segmentId &&
          point.segmentId &&
          previousPoint.segmentId !== point.segmentId)
      ) {
        segments.push([]);
      }
      segments[segments.length - 1].push(point);
      previousPoint = point;
    }
    return segments.filter((segment) => segment.length > 1);
  }, [trackPoints]);

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
        attribution={attribution ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
        url={tileUrl ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
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
      <InitialLocationHandler location={initialLocation} resetKey={resetKey} />
      <FollowLocationHandler
        followEnabled={followEnabled}
        location={followLocation}
        onInterrupted={onFollowInterrupted}
      />
      <DestinationPickHandler onPick={onDestinationPick} />
      {showRiders ? markers : null}
      {showTrack && !navigationRoute &&
        trackSegments.map((segment, index) => (
          <Fragment key={`track-segment-${index}`}>
            <Polyline
              positions={segment.map((point) => [point.lat, point.lng])}
              pathOptions={{ color: 'rgba(0,0,0,0.14)', weight: 6, opacity: 1, lineCap: 'round' }}
            />
            <Polyline
              positions={segment.map((point) => [point.lat, point.lng])}
              pathOptions={{ color: '#285E7A', weight: 4, opacity: 0.92, lineCap: 'round' }}
            />
          </Fragment>
        ))}
      {navigationRoute && (
        <>
          <Polyline
            positions={navigationRoute.coordinates.map((point) => [point.lat, point.lng])}
            pathOptions={{ color: '#FFFFFF', weight: 9, opacity: 0.85, lineCap: 'round' }}
          />
          <Polyline
            positions={navigationRoute.coordinates.map((point) => [point.lat, point.lng])}
            pathOptions={{ color: '#168AAD', weight: 6, opacity: 0.98, lineCap: 'round' }}
          />
        </>
      )}
      {navigationDestination && (
        <CircleMarker
          center={[navigationDestination.lat, navigationDestination.lng]}
          radius={9}
          pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#EF4444', fillOpacity: 1 }}
        />
      )}
    </MapContainer>
  );
};

export default RideMapView;
