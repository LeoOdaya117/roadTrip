import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  polylineGeoJSON: GeoJSON.GeoJSON;
  height?: number;
  className?: string;
  onMapReady?: (map: any) => void;
};

function FitBounds({ geo }: { geo: GeoJSON.GeoJSON }) {
  const map = useMap();
  useEffect(() => {
    try {
      let coords: [number, number][] = [];
      if ((geo as GeoJSON.Feature)?.type === 'Feature') {
        const feat = geo as GeoJSON.Feature;
        if (feat.geometry.type === 'LineString') coords = feat.geometry.coordinates.map((c: any) => [c[1], c[0]]);
      } else if ((geo as GeoJSON.LineString)?.type === 'LineString') {
        coords = (geo as GeoJSON.LineString).coordinates.map((c: any) => [c[1], c[0]]);
      }
      if (coords.length === 0) return;
      map.fitBounds(coords as any, { padding: [40, 40] });
    } catch (e) {
      // ignore
    }
  }, [map, geo]);
  return null;
}

function OnMapReady({ onMapReady }: { onMapReady?: (m: any) => void }) {
  const map = useMap();
  useEffect(() => {
    if (onMapReady) onMapReady(map);
  }, [map, onMapReady]);
  return null;
}

export default function MapView({ polylineGeoJSON, height = 460, className, onMapReady }: Props) {
  // Extract Leaflet-friendly lat-lng pairs
  let latlngs: [number, number][] = [];
  if ((polylineGeoJSON as GeoJSON.Feature)?.type === 'Feature') {
    const feat = polylineGeoJSON as GeoJSON.Feature;
    if (feat.geometry.type === 'LineString') latlngs = feat.geometry.coordinates.map((c: any) => [c[1], c[0]]);
  } else if ((polylineGeoJSON as GeoJSON.LineString)?.type === 'LineString') {
    latlngs = (polylineGeoJSON as GeoJSON.LineString).coordinates.map((c: any) => [c[1], c[0]]);
  }

  const start = latlngs[0];
  const end = latlngs[latlngs.length - 1];

  return (
    <div className={className} style={{ height }}>
      <MapContainer center={start || [0, 0]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        {latlngs.length > 0 && (
          <>
            <Polyline positions={latlngs} pathOptions={{ color: '#ff6b2d', weight: 5, opacity: 0.95 }} />
            {start && <CircleMarker center={start} radius={6} pathOptions={{ color: '#34D399', fillColor: '#34D399' }} />}
            {end && <CircleMarker center={end} radius={6} pathOptions={{ color: '#FB7185', fillColor: '#FB7185' }} />}
            <FitBounds geo={polylineGeoJSON} />
            <OnMapReady onMapReady={onMapReady} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
