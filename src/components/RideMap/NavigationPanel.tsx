import { IonButton, IonIcon } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import { PLACE_SEARCH_ATTRIBUTION, type PlaceSearchResult } from '../../services/placeSearch';
import type { NavigationDestination, NavigationRoute } from '../../types/ride';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  placeResults: PlaceSearchResult[];
  isSearchingPlaces: boolean;
  isDebouncingPlaces: boolean;
  placeSearchError: string | null;
  onSelectPlace: (place: PlaceSearchResult) => void;
  isPickingDestination: boolean;
  onTogglePicking: () => void;
  onClose: () => void;
  destination: NavigationDestination | null;
  route: NavigationRoute | null;
  isGuiding: boolean;
  isRouting: boolean;
  navigationError: string | null;
  supported: boolean;
  hasLocation: boolean;
  onToggleGuidance: () => void;
  onClearDestination: () => void;
  offlineAvailable: boolean;
  isDownloadingTiles: boolean;
  tileDownloadProgress: number | null;
  onDownloadTiles: () => void;
};

const NavigationPanel: React.FC<Props> = ({
  query,
  onQueryChange,
  placeResults,
  isSearchingPlaces,
  isDebouncingPlaces,
  placeSearchError,
  onSelectPlace,
  isPickingDestination,
  onTogglePicking,
  onClose,
  destination,
  route,
  isGuiding,
  isRouting,
  navigationError,
  supported,
  hasLocation,
  onToggleGuidance,
  onClearDestination,
  offlineAvailable,
  isDownloadingTiles,
  tileDownloadProgress,
  onDownloadTiles,
}) => {
  const hasEnoughQuery = query.trim().length >= 3;

  return (
    <section className={`navigation-panel${isGuiding ? ' navigation-panel-guiding' : ''}`} aria-label="Destination search and route options">
      <header className="navigation-panel-header">
        <div>
          <h2>Where to?</h2>
          <p>Search a place or choose a point on the map.</p>
        </div>
        <button type="button" className="navigation-close-button" onClick={onClose} aria-label="Close navigation">
          <IonIcon icon={closeOutline} />
        </button>
      </header>

      {!destination && (
        <>
          <div className="navigation-search-row">
            <label className="sr-only" htmlFor="navigation-place-search">Search a place or address</label>
            <input
              id="navigation-place-search"
              className="navigation-search-input"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Place, street, or address"
              autoComplete="off"
              aria-describedby="navigation-search-help"
            />
            <button
              type="button"
              className={`navigation-pick-button${isPickingDestination ? ' is-active' : ''}`}
              aria-pressed={isPickingDestination}
              onClick={onTogglePicking}
            >
              {isPickingDestination ? 'Tap map…' : 'Pick on map'}
            </button>
          </div>
          <p className="navigation-search-help" id="navigation-search-help">
            {isPickingDestination ? 'Tap anywhere on the map to set your destination.' : 'Search results are limited to the Philippines.'}
          </p>
          {placeResults.length > 0 && (
            <div className="navigation-place-results" role="listbox" aria-label="Place search results">
              {placeResults.map((place, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="navigation-place-result"
                  key={`${place.lat}-${place.lng}-${index}`}
                  onClick={() => onSelectPlace(place)}
                >
                  <span>{place.label}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}
          {(isSearchingPlaces || isDebouncingPlaces) && <div className="navigation-search-note" role="status">Searching places…</div>}
          {!isSearchingPlaces && !isDebouncingPlaces && !placeSearchError && hasEnoughQuery && placeResults.length === 0 && (
            <div className="navigation-search-note" role="status">No places found. Try another name or pick a point on the map.</div>
          )}
          {placeSearchError && <div className="navigation-search-error" role="alert">{placeSearchError}</div>}
          <div className="navigation-attribution">{PLACE_SEARCH_ATTRIBUTION}</div>
        </>
      )}

      {destination && (
        <div className="navigation-destination-card">
          <div className="navigation-destination-copy">
            <span className="navigation-step-label">Route preview</span>
            <strong>{destination.label}</strong>
            {route && (
              <span className="navigation-route-summary">
                <strong>{(route.distanceMeters / 1000).toFixed(1)} km</strong>
                <span aria-hidden="true">·</span>
                <strong>{Math.max(1, Math.round(route.durationSeconds / 60))} min</strong>
              </span>
            )}
            {isRouting && <span role="status">Calculating route…</span>}
            {!hasLocation && <span className="navigation-search-note" role="status">Waiting for your location to calculate the route.</span>}
            {!supported && <span className="navigation-search-note" role="status">Turn-by-turn navigation is unavailable on this device.</span>}
          </div>
          <div className="navigation-actions">
            <IonButton
              size="small"
              onClick={onToggleGuidance}
              disabled={!isGuiding && (!supported || !hasLocation || !route || isRouting)}
            >
              {isGuiding ? 'Stop guidance' : 'Start ride'}
            </IonButton>
            <IonButton size="small" fill="clear" onClick={onClearDestination}>
              Edit destination
            </IonButton>
          </div>
        </div>
      )}

      {navigationError && <div className="navigation-search-error" role="alert">{navigationError}</div>}
      <div className="navigation-offline-note">
        {offlineAvailable
          ? 'Offline routing is ready. Place search and map imagery still need internet.'
          : 'Online routing works across the Philippines. Regional offline routing can be downloaded for later.'}
      </div>
      {!offlineAvailable && (
        <IonButton
          className="navigation-download-button"
          size="small"
          expand="block"
          disabled={isDownloadingTiles}
          onClick={onDownloadTiles}
        >
          {isDownloadingTiles
            ? `Downloading offline map${tileDownloadProgress == null ? '…' : ` · ${tileDownloadProgress}%`}`
            : 'Download regional offline map · ~227 MB'}
        </IonButton>
      )}
      <div className="navigation-attribution">Routing data © OpenStreetMap contributors</div>
    </section>
  );
};

export default NavigationPanel;
