import { memo } from 'react';
import '../styles/RiderMarker.css';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Rider } from '../types/ride';
import { useRideStore } from '../store/rideStore';

type RiderMarkerProps = {
  rider: Rider;
  isCurrentUser: boolean;
  accuracy?: number | null;
};

const createPhotoIcon = (photoUrl?: string, size = 46, isCurrentUser = false, accuracy?: number | null) => {
  const hasPhoto = !!photoUrl;
  const imgHtml = hasPhoto ? `<img src="${photoUrl}" alt="" onerror="this.style.display='none'" />` : '';
  const fallbackStyle = hasPhoto ? 'display:none' : '';

  // make the current-user marker compact and add pulse rings behind it
  if (isCurrentUser) {
    const compactSize = 36; // original small avatar size the user preferred

    // derive pulse size and opacity from accuracy (meters)
    const acc = typeof accuracy === 'number' && !Number.isNaN(accuracy) ? Math.max(0, accuracy) : null;
    const defaultPulseSize = 100; // moderate px when accuracy not provided
    const defaultPulseOpacity = 0.28; // earlier visible default

    // Map accuracy to pulse size/opacity; use defaults when accuracy missing
    let pulseSize: number;
    let pulseOpacity: number;
    if (acc === null) {
      pulseSize = defaultPulseSize;
      pulseOpacity = defaultPulseOpacity;
    } else {
      const minAcc = 0;
      const maxAcc = 200;
      const clampAcc = Math.min(maxAcc, Math.max(minAcc, acc));
      const t = clampAcc / maxAcc;
      pulseSize = Math.round(48 + t * (120 - 48));
      pulseOpacity = (1 - t) * 0.58 + 0.12;
    }

    const ringBaseOpacity = (pulseOpacity * 0.6).toFixed(3);

    // Two staggered rings with 3000ms duration for a smooth continuous ripple
    const html = `
      <div class="rider-me-wrapper" style="width:${compactSize}px;height:${compactSize}px; --pulse-size: ${pulseSize}px; --pulse-opacity: ${pulseOpacity}; --ring-alpha: ${ringBaseOpacity}; --pulse-duration: 3000ms;">
        <div class="rider-me-pulse" aria-hidden="true">
          <div class="ring ring-1" style="background: rgba(255,107,53, var(--ring-alpha));"></div>
          <div class="ring ring-2" style="background: rgba(255,107,53, var(--ring-alpha)); animation-delay: calc(-1 * var(--pulse-duration) / 2);"></div>
        </div>
        <div class="rider-icon rider-icon--me" style="width:${compactSize}px;height:${compactSize}px;">
          ${imgHtml}
          <div class="rider-fallback" style="${fallbackStyle}"></div>
        </div>
      </div>
    `;

    const outer = Math.max(pulseSize, compactSize) + 8;
    return L.divIcon({ className: 'rider-div-icon', html, iconSize: [outer, outer], iconAnchor: [outer / 2, outer / 2] });
  }

  const html = `
    <div class="rider-icon" style="width:${size}px;height:${size}px;">
      ${imgHtml}
      <div class="rider-fallback" style="${fallbackStyle}"></div>
    </div>
  `;

  return L.divIcon({ className: 'rider-div-icon', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
};

const RiderMarker = ({ rider, isCurrentUser, accuracy }: RiderMarkerProps) => {
  const icon = createPhotoIcon(rider.avatarUrl, isCurrentUser ? 56 : 46, isCurrentUser, accuracy);
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
