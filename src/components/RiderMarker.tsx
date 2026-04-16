import { memo } from 'react';
import { CircleMarker, Marker, Tooltip } from 'react-leaflet';
import { Rider } from '../types/ride';

type RiderMarkerProps = {
  rider: Rider;
  isCurrentUser: boolean;
};

const RiderMarker = ({ rider, isCurrentUser }: RiderMarkerProps) => {
  if (isCurrentUser) {
    return (
      <CircleMarker
        center={[rider.lat, rider.lng]}
        radius={8}
        pathOptions={{
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.9
        }}
      >
        <Tooltip direction="top" offset={[0, -6]}>{rider.name}</Tooltip>
      </CircleMarker>
    );
  }

  return (
    <Marker position={[rider.lat, rider.lng]}>
      <Tooltip direction="top" offset={[0, -6]}>{rider.name}</Tooltip>
    </Marker>
  );
};

export default memo(RiderMarker);
