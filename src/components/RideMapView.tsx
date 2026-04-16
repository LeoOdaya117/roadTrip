import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../services/leafletConfig';
import RiderMarker from './RiderMarker';
import { Rider } from '../types/ride';
import type L from 'leaflet';

type RideMapViewProps = {
  center: { lat: number; lng: number };
  riders: Rider[];
  currentUserId?: string;
  onMapReady?: (map: L.Map) => void;
};

const MapReadyHandler = ({ onReady }: { onReady?: (map: L.Map) => void }) => {
  const map = useMap();

  useEffect(() => {
    if (onReady) {
      onReady(map);
    }
  }, [map, onReady]);

  return null;
};

const RideMapView = ({ center, riders, currentUserId, onMapReady }: RideMapViewProps) => {
  const markers = useMemo(
    () =>
      riders.map((rider) => (
        <RiderMarker
          key={rider.id}
          rider={rider}
          isCurrentUser={rider.id === currentUserId}
        />
      )),
    [riders, currentUserId]
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      className="map-container"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapReadyHandler onReady={onMapReady} />
      {markers}
    </MapContainer>
  );
};

export default RideMapView;
