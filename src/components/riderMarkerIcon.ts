import L from 'leaflet';
import type { MapMarkerStyle } from '../types/ride';

const riderColors = ['#DB5B47', '#7357C8', '#16876E', '#C27A13', '#CC4D91', '#2878E8'];

const colorForRider = (riderId: string) => {
  let hash = 0;
  for (let i = 0; i < riderId.length; i += 1) hash = (hash * 31 + riderId.charCodeAt(i)) | 0;
  return riderColors[Math.abs(hash) % riderColors.length];
};

const vehicleGlyph = (style: MapMarkerStyle) => {
  if (style === 'motorcycle') {
    return '<svg viewBox="0 0 32 24" aria-hidden="true"><circle cx="7" cy="18" r="3.1"/><circle cx="25" cy="18" r="3.1"/><path d="M7 18l5-8h5l4 8h4M12 10l-2-3h5l2 3m-4 0 4 8m-4-6h7l2 3"/></svg>';
  }
  if (style === 'car') {
    return '<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M5 15l2-6a2 2 0 0 1 2-1h14a2 2 0 0 1 2 1l2 6v4h-3v-2H8v2H5zM8 14h16l-1.4-4H9.4z"/><circle cx="10" cy="18" r="1.5"/><circle cx="22" cy="18" r="1.5"/></svg>';
  }
  return '<svg viewBox="0 0 32 24" aria-hidden="true"><circle cx="7" cy="17" r="4"/><circle cx="25" cy="17" r="4"/><path d="M7 17l6-9 5 9H7l4-6h8l6 6m-12-9h3"/></svg>';
};

export const createRiderMarkerIcon = ({
  riderId,
  isCurrentUser,
  markerStyle = 'circle',
  accuracy,
}: { riderId: string; isCurrentUser: boolean; markerStyle?: MapMarkerStyle; accuracy?: number | null }) => {
  if (!isCurrentUser) {
    const color = colorForRider(riderId);
    const html = `<span class="rider-location-marker rider-location-marker--other" style="--rider-color:${color}"><span></span></span>`;
    return L.divIcon({ className: 'rider-div-icon', html, iconSize: [30, 30], iconAnchor: [15, 15] });
  }

  const acc = typeof accuracy === 'number' && Number.isFinite(accuracy) ? Math.max(0, Math.min(accuracy, 200)) : null;
  const haloSize = acc === null ? 44 : Math.round(30 + (acc / 200) * 32);
  const vehicle = markerStyle !== 'circle';
  const html = vehicle
    ? `<span class="rider-location-marker rider-location-marker--vehicle" style="--accuracy-size:${haloSize}px">${vehicleGlyph(markerStyle)}<i></i></span>`
    : `<span class="rider-location-marker rider-location-marker--current" style="--accuracy-size:${haloSize}px"><span></span></span>`;
  const size = vehicle ? 52 : Math.max(46, haloSize + 12);
  return L.divIcon({ className: 'rider-div-icon', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
};
