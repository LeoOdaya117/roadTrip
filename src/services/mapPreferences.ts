import type { MapMarkerStyle } from '../types/ride';

export const MAP_MARKER_STYLE_KEY = 'rt_map_marker_style';
export const DEFAULT_MAP_MARKER_STYLE: MapMarkerStyle = 'circle';

const isMapMarkerStyle = (value: unknown): value is MapMarkerStyle =>
  value === 'circle' || value === 'motorcycle' || value === 'car' || value === 'bicycle';

export const loadMapMarkerStyle = (): MapMarkerStyle => {
  try {
    const stored = localStorage.getItem(MAP_MARKER_STYLE_KEY);
    return isMapMarkerStyle(stored) ? stored : DEFAULT_MAP_MARKER_STYLE;
  } catch {
    return DEFAULT_MAP_MARKER_STYLE;
  }
};

export const saveMapMarkerStyle = (style: MapMarkerStyle): boolean => {
  try {
    localStorage.setItem(MAP_MARKER_STYLE_KEY, style);
    return true;
  } catch {
    return false;
  }
};
