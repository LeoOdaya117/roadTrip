import { memo } from 'react';
import { CircleMarker, Tooltip } from 'react-leaflet';
import { Rider } from '../types/ride';

type RiderMarkerProps = {
  rider: Rider;
  isCurrentUser: boolean;
};

const RiderMarker = ({ rider, isCurrentUser }: RiderMarkerProps) => {
  return (
    <CircleMarker
      center={[rider.lat, rider.lng]}
      radius={isCurrentUser ? 9 : 7}
      pathOptions={{
        color: isCurrentUser ? '#4f46e5' : '#0f172a',
        weight: 2,
        fillColor: isCurrentUser ? '#6366f1' : '#22c55e',
        fillOpacity: 0.95
      }}
    >
      <Tooltip direction="top" offset={[0, -6]}>{rider.name}</Tooltip>
    </CircleMarker>
  );
};

export default memo(RiderMarker);
