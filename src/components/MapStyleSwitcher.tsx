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
};

const MapStyleSwitcher: React.FC<MapStyleSwitcherProps> = ({
  layers,
  activeLayerId,
  onChange,
  overlays,
  enabledOverlays,
  onToggleOverlay
}) => {
  return (
    <div>
      <div className="sheet-section-label">Map Type</div>
      <div className="map-style-row" role="tablist" aria-label="Map style selector">
        {layers.map((layer) => {
          const isActive = activeLayerId === layer.id;
          return (
            <button
              key={layer.id}
              role="tab"
              aria-selected={isActive}
              aria-label={`Switch map to ${layer.label}`}
              onClick={() => onChange(layer)}
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

export default MapStyleSwitcher;