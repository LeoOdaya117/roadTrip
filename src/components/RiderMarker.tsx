import { memo } from 'react';
import '../styles/RiderMarker.css';
import { Marker, Popup } from 'react-leaflet';
import type { MapMarkerStyle, Rider } from '../types/ride';
import { useRideStore } from '../store/rideStore';
import { createRiderMarkerIcon } from './riderMarkerIcon';

type RiderMarkerProps = {
  rider: Rider;
  isCurrentUser: boolean;
  accuracy?: number | null;
  markerStyle?: MapMarkerStyle;
};

const RiderMarker = ({ rider, isCurrentUser, accuracy, markerStyle = 'circle' }: RiderMarkerProps) => {
  const icon = createRiderMarkerIcon({ riderId: rider.id, isCurrentUser, accuracy, markerStyle });
  const currentTopic = useRideStore((s) => s.currentTopic);
  const messages = useRideStore((s) => s.messages);
  const topicMessages = messages.filter((m) => m.topic === currentTopic && m.senderId === rider.id);

  return (
    <Marker position={[rider.lat, rider.lng]} icon={icon} interactive>
      <Popup className="rider-popup">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, flexShrink: 0 }}>
            {rider.avatarUrl ? (
              <img
                src={rider.avatarUrl}
                alt={rider.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                onError={(e) => {
                  // hide broken image
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{rider.name}</div>
            {/* Show a compact list of topic messages for the currently selected topic */}
            {currentTopic && topicMessages.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {topicMessages.map((m) => (
                  <div key={m.id} style={{ fontSize: 12, color: '#334155' }}>{m.text}</div>
                ))}
              </div>
            )}
            {rider.photos && rider.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {rider.photos.slice(0, 3).map((p) => (
                  <img key={p} src={p} alt="photo" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} onError={(e)=>((e.target as HTMLImageElement).style.display='none')} />
                ))}
              </div>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

export default memo(RiderMarker);
