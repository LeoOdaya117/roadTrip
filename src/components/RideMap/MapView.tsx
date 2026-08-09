import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  polylineGeoJSON: GeoJSON.GeoJSON;
  height?: number;
  className?: string;
  onMapReady?: (map: LeafletMap) => void;
};

const getLatLngs = (geo: GeoJSON.GeoJSON): [number, number][] => {
  const geometry = geo.type === 'Feature' ? geo.geometry : geo;
  if (geometry.type !== 'LineString') return [];
  return geometry.coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);
};

function FitBounds({ geo }: { geo: GeoJSON.GeoJSON }) {
  const map = useMap();
  useEffect(() => {
    try {
      const coords = getLatLngs(geo);
      if (coords.length === 0) return;
      map.fitBounds(coords as LatLngBoundsExpression, { padding: [40, 40] });
    } catch {
      // Ignore malformed legacy GeoJSON.
    }
  }, [map, geo]);
  return null;
}

function OnMapReady({ onMapReady, setInternalMap }: { onMapReady?: (map: LeafletMap) => void; setInternalMap?: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    if (setInternalMap) setInternalMap(map);
    if (onMapReady) onMapReady(map);
  }, [map, onMapReady, setInternalMap]);
  return null;
}

export default function MapView({ polylineGeoJSON, height = 460, className, onMapReady }: Props) {
  // Extract Leaflet-friendly lat-lng pairs
  const latlngs = getLatLngs(polylineGeoJSON);

  const start = latlngs[0];
  const end = latlngs[latlngs.length - 1];
  const [mapRef, setMapRef] = useState<LeafletMap | null>(null);

  return (
    <div className={className} style={{ height, position: 'relative' }}>
      <MapContainer center={start || [0, 0]} zoom={13} maxZoom={22} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        {latlngs.length > 0 && (
          <>
            {/* subtle shadow beneath the route for better contrast on photos */}
            <Polyline positions={latlngs} pathOptions={{ color: 'rgba(0,0,0,0.12)', weight: 8, opacity: 1, lineCap: 'round' }} />
            <Polyline positions={latlngs} pathOptions={{ color: '#ff6b2d', weight: 4, opacity: 0.75, lineCap: 'round' }} />
            {start && <CircleMarker center={start} radius={6} pathOptions={{ color: '#34D399', fillColor: '#34D399' }} />}
            {end && <CircleMarker center={end} radius={6} pathOptions={{ color: '#FB7185', fillColor: '#FB7185' }} />}
            <FitBounds geo={polylineGeoJSON} />
            <OnMapReady onMapReady={onMapReady} setInternalMap={setMapRef} />
          </>
        )}
      </MapContainer>
      <button
        className="map-center-btn"
        onClick={() => {
          try {
            if (mapRef && latlngs.length > 0) mapRef.fitBounds(latlngs as LatLngBoundsExpression, { padding: [40, 40] });
          } catch (e) { console.warn('center map failed', e); }
        }}
        title="Center route"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M6.34 6.34L4.93 4.93M19.07 19.07l-1.41-1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="#08101a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" fill="#ff6b35" />
        </svg>
      </button>
    </div>
  );
}
