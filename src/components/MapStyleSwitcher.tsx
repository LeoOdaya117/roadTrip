import '../styles/MapStyleSwitcher.css';
import { IonIcon } from '@ionic/react';
import { bicycle, carSport } from 'ionicons/icons';
import { useRef } from 'react';
import type { MapMarkerStyle } from '../types/ride';
type MapLayerOption = {
  id: string;
  label: string;
  url: string;
  attribution: string;
  previewSrc?: string;
};

type OverlayOption = {
  id: string;
  label: string;
};

type MapStyleSwitcherProps = {
  layers: MapLayerOption[];
  activeLayerId: string;
  onChange: (layer: MapLayerOption) => void;
  overlays: OverlayOption[];
  enabledOverlays: string[];
  onToggleOverlay: (overlayId: string) => void;
  markerStyle: MapMarkerStyle;
  onChangeMarkerStyle: (style: MapMarkerStyle) => void;
};

const markerOptions: Array<{ id: MapMarkerStyle; label: string }> = [
  { id: 'circle', label: 'Location dot' },
  { id: 'motorcycle', label: 'Motorcycle' },
  { id: 'car', label: 'Car' },
  { id: 'bicycle', label: 'Bicycle' },
];

const MapStyleSwitcher: React.FC<MapStyleSwitcherProps> = ({
  layers,
  activeLayerId,
  onChange,
  overlays,
  enabledOverlays,
  onToggleOverlay,
  markerStyle,
  onChangeMarkerStyle,
}) => {
  const styleTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusStyleTab = (index: number) => {
    const tab = styleTabRefs.current[index];
    if (!tab) return;
    tab.focus();
    tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const layer = layers[index];
    if (layer) onChange(layer);
  };

  return (
    <div>
      <div className="sheet-section-label">Map Type</div>
      <div className="map-style-row" role="tablist" aria-label="Map style selector" aria-orientation="horizontal">
        {layers.map((layer, index) => {
          const isActive = activeLayerId === layer.id;
          return (
            <button
              key={layer.id}
              ref={(element) => { styleTabRefs.current[index] = element; }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              aria-label={`Switch map to ${layer.label}`}
              onClick={() => onChange(layer)}
              onFocus={(event) => event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })}
              onKeyDown={(event) => {
                if (!layers.length) return;
                let nextIndex: number | null = null;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % layers.length;
                if (event.key === 'ArrowLeft') nextIndex = (index - 1 + layers.length) % layers.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = layers.length - 1;
                if (nextIndex !== null) {
                  event.preventDefault();
                  focusStyleTab(nextIndex);
                }
              }}
              className={`map-style-card${isActive ? ' map-style-card-active' : ''}`}
            >
              <span className={`map-style-thumb map-style-thumb-${layer.id}`}>
                {layer.previewSrc ? (
                  <img src={layer.previewSrc} alt="" aria-hidden="true" className="map-style-thumb-image" />
                ) : null}
              </span>
              <span className="map-style-name">{layer.label}</span>
            </button>
          );
        })}
      </div>

      <div className="map-marker-setting-heading">
        <div className="sheet-section-label">Your map marker</div>
        <p>Choose how your location appears on this device.</p>
      </div>
      <div className="map-marker-options" role="group" aria-label="Your map marker">
        {markerOptions.map((option) => {
          const selected = markerStyle === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`map-marker-option${selected ? ' map-marker-option-active' : ''}`}
              aria-pressed={selected}
              aria-label={`Use ${option.label.toLowerCase()} marker`}
              onClick={() => onChangeMarkerStyle(option.id)}
            >
              <span className={`map-marker-preview map-marker-preview-${option.id}`} aria-hidden="true">
                {option.id === 'circle' && <span className="map-marker-dot" />}
                {option.id === 'motorcycle' && <MotorcycleGlyph />}
                {option.id === 'car' && <IonIcon icon={carSport} />}
                {option.id === 'bicycle' && <IonIcon icon={bicycle} />}
              </span>
              <span>{option.label}</span>
              <span className="map-marker-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="sheet-section-label">Map Details</div>
      <div className="map-overlay-row" role="group" aria-label="Map overlay options">
        {overlays.map((overlay) => {
          const enabled = enabledOverlays.includes(overlay.id);
          return (
            <button
              key={overlay.id}
              aria-pressed={enabled}
              onClick={() => onToggleOverlay(overlay.id)}
              className={`map-overlay-chip${enabled ? ' map-overlay-chip-active' : ''}`}
            >
              {overlay.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const MotorcycleGlyph = () => (
  <svg viewBox="0 0 32 24" focusable="false" aria-hidden="true">
    <circle cx="7" cy="18" r="3.1" />
    <circle cx="25" cy="18" r="3.1" />
    <path d="M7 18l5-8h5l4 8h4M12 10l-2-3h5l2 3m-4 0 4 8m-4-6h7l2 3" />
  </svg>
);

export default MapStyleSwitcher;
