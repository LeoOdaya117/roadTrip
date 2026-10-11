import { IonSpinner } from '@ionic/react';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { calculateRouteOptions, supportsTurnByTurnNavigation } from '../services/navigationEngine';
import { getCurrentLocationFix } from '../services/currentLocation';
import { PLACE_SEARCH_ATTRIBUTION, searchPlaces, type PlaceSearchResult } from '../services/placeSearch';
import type { LocationPoint, NavigationDestination, NavigationRouteOption } from '../types/ride';

type Props = {
  busy: boolean;
  errorMessage?: string | null;
  isModalPresented?: boolean;
  onCancel: () => void;
  onContinue: (mode: 'group' | 'solo', destination: NavigationDestination, routeIndex: number) => void;
};

type Step = 'mode' | 'destination' | 'routes' | 'review';

const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];

const MapTap: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({ click: ({ latlng }) => onPick(latlng.lat, latlng.lng) });
  return null;
};

const FitRouteBounds: React.FC<{ coordinates: Array<{ lat: number; lng: number }> }> = ({ coordinates }) => {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length > 1) {
      map.fitBounds(coordinates.map(({ lat, lng }) => [lat, lng] as [number, number]), { padding: [24, 24], maxZoom: 13 });
    }
  }, [coordinates, map]);
  return null;
};

const MapSizeObserver: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    let frame = 0;
    const invalidate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };
    map.whenReady(invalidate);
    const container = map.getContainer();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate);
    observer?.observe(container);
    window.addEventListener('resize', invalidate);
    invalidate();
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', invalidate);
    };
  }, [map]);
  return null;
};

const MapCenterController: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 12), { animate: false });
  }, [center, map]);
  return null;
};

const MapTiles: React.FC<{ onError: () => void }> = ({ onError }) => (
  <TileLayer
    attribution="&copy; OpenStreetMap contributors"
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    eventHandlers={{ tileerror: onError }}
  />
);

type IonicBackButtonEvent = CustomEvent<{
  register: (priority: number, handler: () => void) => void;
}>;

const RideSetupWizard: React.FC<Props> = ({ busy, errorMessage, isModalPresented, onCancel, onContinue }) => {
  const supported = supportsTurnByTurnNavigation();
  const totalSteps = supported ? 4 : 3;
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<'group' | 'solo'>('solo');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetryCount, setSearchRetryCount] = useState(0);
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationRetryCount, setLocationRetryCount] = useState(0);
  const [destination, setDestination] = useState<NavigationDestination | null>(null);
  const [candidate, setCandidate] = useState<NavigationDestination | null>(null);
  const [routeOptions, setRouteOptions] = useState<NavigationRouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isRouting, setIsRouting] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [routeRetryCount, setRouteRetryCount] = useState(0);
  const [mapTilesFailed, setMapTilesFailed] = useState(false);
  const [mapTileRetryCount, setMapTileRetryCount] = useState(0);
  const lastRouteRequestRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLDivElement | null>(null);
  const wizardRef = useRef<HTMLElement | null>(null);
  const lastFocusedStepRef = useRef<Step | null>(null);

  const stepNumber = step === 'mode' ? 1 : step === 'destination' ? 2 : step === 'routes' ? 3 : totalSteps;
  const selectedRoute = routeOptions[selectedRouteIndex]?.route;
  const center = useMemo<[number, number]>(() => {
    const focus = candidate ?? destination;
    if (focus) return [focus.lat, focus.lng];
    if (location) return [location.lat, location.lng];
    return DEFAULT_CENTER;
  }, [candidate, destination, location]);

  const handleBack = useCallback(() => {
    if (busy) return;
    if (step === 'review') {
      setStep(supported ? 'routes' : 'destination');
    } else if (step === 'routes' || step === 'destination') {
      setStep(step === 'routes' ? 'destination' : 'mode');
    } else {
      onCancel();
    }
  }, [busy, onCancel, step, supported]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onCancel();
      }
    };
    const onIonicBack = (event: Event) => {
      (event as IonicBackButtonEvent).detail.register(1000, () => {
        if (!busy) onCancel();
      });
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('ionBackButton', onIonicBack);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('ionBackButton', onIonicBack);
    };
  }, [busy, onCancel]);

  useLayoutEffect(() => {
    if (!isModalPresented) return;
    const heading = headingRef.current;
    if (!heading) return;
    const previousStep = lastFocusedStepRef.current;
    const activeControlInsideWizard = Boolean(
      wizardRef.current?.contains(document.activeElement) && document.activeElement !== document.body,
    );
    lastFocusedStepRef.current = step;
    // Ionic can finish its opening animation after a quick user tap. Preserve
    // that interaction instead of moving focus away from a field or control.
    if (previousStep === null && activeControlInsideWizard) return;
    if (previousStep === step) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView?.({ behavior: 'auto', block: 'nearest' });
  }, [isModalPresented, step]);

  useEffect(() => {
    if (location || (step !== 'destination' && !(step === 'routes' && locationRetryCount > 0))) return;
    let cancelled = false;
    setIsLoadingLocation(true);
    setLocationError(null);
    void getCurrentLocationFix().then((point) => {
      if (!cancelled) {
        setLocation(point);
        setLocationError(null);
      }
    }).catch((error: unknown) => {
      if (!cancelled) setLocationError(error instanceof Error ? error.message : 'Current location is unavailable.');
    }).finally(() => {
      if (!cancelled) setIsLoadingLocation(false);
    });
    return () => { cancelled = true; };
  }, [location, locationRetryCount, step, supported]);

  useEffect(() => {
    const normalized = query.trim();
    // A result belongs to the query that produced it. Hide old rows immediately
    // when the rider edits the query, including during the debounce window.
    setResults([]);
    setSearchError(null);
    if (step !== 'destination' || normalized.length < 2) {
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      setSearchError(null);
      void searchPlaces(normalized, { signal: controller.signal, bias: location ?? undefined })
        .then((nextResults) => {
          if (!controller.signal.aborted) setResults(nextResults);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && !(error instanceof Error && error.name === 'AbortError')) {
            setSearchError(error instanceof Error ? error.message : 'Place search is unavailable.');
            setResults([]);
          }
        })
        .finally(() => { if (!controller.signal.aborted) setIsSearching(false); });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [location, query, searchRetryCount, step]);

  useEffect(() => {
    if (!destination || !location || !supported || step !== 'routes') return;
    const requestKey = `${location.lat},${location.lng}->${destination.lat},${destination.lng}`;
    if (lastRouteRequestRef.current === requestKey) return;
    lastRouteRequestRef.current = requestKey;
    let cancelled = false;
    setIsRouting(true);
    setRoutingError(null);
    void calculateRouteOptions({ lat: location.lat, lng: location.lng }, destination)
      .then((options) => {
        if (cancelled) return;
        setRouteOptions(options);
        setSelectedRouteIndex(0);
        if (!options.length) setRoutingError('No routes were found for this destination.');
      })
      .catch((error: unknown) => {
        if (!cancelled) setRoutingError(error instanceof Error ? error.message : 'Could not calculate routes. Check your connection and try again.');
      })
      .finally(() => { if (!cancelled) setIsRouting(false); });
    return () => { cancelled = true; };
  }, [destination, location, routeRetryCount, step, supported]);

  const retryLocation = () => {
    setLocationError(null);
    setLocationRetryCount((count) => count + 1);
  };

  const editDestination = () => {
    setCandidate(destination);
    setRouteOptions([]);
    setRoutingError(null);
    lastRouteRequestRef.current = null;
    setStep('destination');
  };

  const confirmCandidate = () => {
    if (!candidate || busy) return;
    setDestination(candidate);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    lastRouteRequestRef.current = null;
    setRoutingError(null);
    setStep(supported ? 'routes' : 'review');
  };

  const retryRoutes = () => {
    if (!location || isRouting) return;
    lastRouteRequestRef.current = null;
    setRouteOptions([]);
    setRoutingError(null);
    setRouteRetryCount((count) => count + 1);
  };

  const title = step === 'mode'
    ? 'How are you riding?'
    : step === 'destination'
      ? 'Choose your destination'
      : step === 'routes'
        ? 'Choose your route'
        : 'Review your ride';
  const description = step === 'mode'
    ? 'Choose a solo ride or create a ride for your crew.'
    : step === 'destination'
      ? 'Search for a place or tap the map, then confirm your destination.'
      : step === 'routes'
        ? destination?.label ?? 'Compare available routes.'
        : 'Everything look right? Your ride starts after you confirm.';

  return (
    <section ref={wizardRef} className={`ride-setup${step === 'destination' ? ' ride-setup-destination-map' : ''}`} aria-label="Ride setup">
      <header className={`ride-setup-heading${step === 'destination' ? ' ride-setup-map-heading' : ''}`}>
        {step === 'destination' && <button type="button" className="ride-setup-map-back" onClick={handleBack} disabled={busy} aria-label="Back to ride type">‹</button>}
        <div ref={headingRef} tabIndex={-1} className="ride-setup-heading-copy">
          <div className="ride-setup-step">Step {stepNumber} of {totalSteps} · {mode === 'solo' ? 'Solo ride' : 'Group ride'}</div>
          <div className="ride-setup-progress" aria-label={`Step ${stepNumber} of ${totalSteps}`}>
            {Array.from({ length: totalSteps }, (_, index) => <span key={index} className={index + 1 <= stepNumber ? 'is-complete' : ''} />)}
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>

      {errorMessage && <p className="ride-setup-error" role="alert" aria-live="assertive" aria-atomic="true">{errorMessage}</p>}

      {step === 'mode' ? (
        <fieldset className="ride-setup-mode-options">
          <legend className="sr-only">Choose ride type</legend>
          <label className={`ride-setup-choice${mode === 'solo' ? ' is-selected' : ''}`}>
            <input type="radio" name="ride-mode" value="solo" checked={mode === 'solo'} onChange={() => setMode('solo')} />
            <span className="ride-setup-mode-radio" aria-hidden="true" />
            <strong>Solo ride</strong><span>Your own route, saved on this device.</span>
          </label>
          <label className={`ride-setup-choice${mode === 'group' ? ' is-selected' : ''}`}>
            <input type="radio" name="ride-mode" value="group" checked={mode === 'group'} onChange={() => setMode('group')} />
            <span className="ride-setup-mode-radio" aria-hidden="true" />
            <strong>Group ride</strong><span>Create a shared ride and invite your crew.</span>
          </label>
        </fieldset>
      ) : step === 'destination' ? (
        <>
          <div className="ride-setup-map-wrap ride-setup-full-map" aria-label="Choose a destination on the map">
            <MapContainer key={mapTileRetryCount} center={center} zoom={12} scrollWheelZoom className="ride-setup-map">
              <MapSizeObserver />
              <MapCenterController center={center} />
              <MapTiles onError={() => setMapTilesFailed(true)} />
              <MapTap onPick={(lat, lng) => setCandidate({ lat, lng, label: `Map pin · ${lat.toFixed(4)}, ${lng.toFixed(4)}` })} />
              {location && <CircleMarker center={[location.lat, location.lng]} radius={7} pathOptions={{ color: '#256af4', fillColor: '#78a5ff', fillOpacity: 1 }} />}
              {candidate && <CircleMarker center={[candidate.lat, candidate.lng]} radius={9} pathOptions={{ color: '#c77726', fillColor: '#f1b35f', fillOpacity: 1 }} />}
            </MapContainer>
            <div className="ride-setup-map-search">
              <div className="ride-setup-search ride-setup-search-floating">
                <label htmlFor="ride-destination-search">Search destination</label>
                <input
                  id="ride-destination-search"
                  type="search"
                  value={query}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setQuery(nextQuery);
                    setResults([]);
                    setSearchError(null);
                    setIsSearching(nextQuery.trim().length >= 2);
                  }}
                  placeholder="Place, street, or address"
                  autoComplete="off"
                  aria-describedby={(isSearching || searchError || (query.trim().length >= 2 && results.length === 0)) ? 'ride-search-feedback' : undefined}
                />
                <span className="ride-setup-search-attribution">{PLACE_SEARCH_ATTRIBUTION}</span>
              </div>
            </div>
            <div className="ride-setup-search-overlay" aria-live="polite">
              {isSearching && <div className="ride-setup-search-feedback" id="ride-search-feedback" role="status"><IonSpinner name="dots" /> Searching places…</div>}
              {!isSearching && searchError && (
                <div className="ride-setup-search-feedback is-error" id="ride-search-feedback" role="alert">
                  <span>{searchError}</span><button type="button" onClick={() => setSearchRetryCount((count) => count + 1)}>Retry search</button>
                </div>
              )}
              {!isSearching && !searchError && query.trim().length >= 2 && results.length === 0 && <div className="ride-setup-search-feedback" id="ride-search-feedback" role="status">No places found. Try another search or tap the map.</div>}
              {results.length > 0 && (
                <div className="ride-setup-results ride-setup-results-floating" aria-label="Destination search results">
                  {results.map((place) => {
                    const isSelected = candidate?.lat === place.lat && candidate?.lng === place.lng;
                    return <button key={`${place.lat},${place.lng}`} type="button" aria-pressed={isSelected} onClick={() => setCandidate({ lat: place.lat, lng: place.lng, label: place.label })}>
                      <span>{place.label}</span><span aria-hidden="true">{isSelected ? '✓' : '›'}</span>
                    </button>;
                  })}
                </div>
              )}
            </div>
            <span className="ride-setup-map-hint" aria-live="polite">{candidate ? `Selected · ${candidate.label}` : 'Tap the map to drop a destination pin'}</span>
          </div>
          {mapTilesFailed && !locationError && !candidate && query.trim().length < 2 && <div className="ride-setup-map-error" role="status"><span>Some map tiles could not load. Check your connection; you can still search or choose a pin.</span><button type="button" onClick={() => { setMapTilesFailed(false); setMapTileRetryCount((count) => count + 1); }}>Retry map</button></div>}
          {isLoadingLocation && <p className="ride-setup-location-status" role="status"><IonSpinner name="dots" /> Finding your location…</p>}
          {locationError && <div className="ride-setup-location-status is-error" role="status"><span>{locationError}</span><button type="button" onClick={retryLocation} disabled={isLoadingLocation}>Retry location</button>{mapTilesFailed && <><span>Map tiles are unavailable. You can still search or choose a pin.</span><button type="button" onClick={() => { setMapTilesFailed(false); setMapTileRetryCount((count) => count + 1); }}>Retry map</button></>}</div>}
        </>
      ) : step === 'routes' ? (
        <>
          <div className="ride-setup-route-map" aria-label="Route preview">
            <MapContainer key={mapTileRetryCount} center={center} zoom={11} scrollWheelZoom className="ride-setup-map">
              <MapSizeObserver />
              <MapTiles onError={() => setMapTilesFailed(true)} />
              {location && <CircleMarker center={[location.lat, location.lng]} radius={7} pathOptions={{ color: '#1c5d4c', fillColor: '#72c6a0', fillOpacity: 1 }} />}
              {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: '#9b6330', fillColor: '#eaa65e', fillOpacity: 1 }} />}
              {routeOptions.map((option, index) => (
                <Polyline key={`${option.label}-${index}`} positions={option.route.coordinates.map(({ lat, lng }) => [lat, lng])} pathOptions={{ color: index === selectedRouteIndex ? '#1c5d4c' : '#75909a', weight: index === selectedRouteIndex ? 6 : 3, opacity: index === selectedRouteIndex ? 0.95 : 0.65 }} />
              ))}
              {selectedRoute && <FitRouteBounds coordinates={selectedRoute.coordinates} />}
            </MapContainer>
            {mapTilesFailed && <div className="ride-setup-map-error" role="status"><span>Some map tiles could not load. You can still review or continue without guidance.</span><button type="button" onClick={() => { setMapTilesFailed(false); setMapTileRetryCount((count) => count + 1); }}>Retry map</button></div>}
          </div>
          {isRouting && <p className="ride-setup-status" role="status"><IonSpinner name="dots" /> Comparing available routes…</p>}
          {supported && !location && !isLoadingLocation && (
            <div className="ride-setup-notice" role="status"><span>{locationError ?? 'Current location is needed to compare routes.'}</span><button type="button" onClick={retryLocation}>Retry location</button></div>
          )}
          {routingError && <p className="ride-setup-error" role="alert">{routingError}</p>}
          {routingError && location && <button type="button" className="ride-setup-retry" onClick={retryRoutes} disabled={isRouting}>Retry route search</button>}
          {routeOptions.length > 0 && (
            <fieldset className="ride-setup-route-list">
              <legend className="sr-only">Available routes</legend>
              {routeOptions.map((option, index) => (
                <label key={`${option.label}-${index}`} className={`ride-setup-route-choice${index === selectedRouteIndex ? ' is-selected' : ''}`}>
                  <input type="radio" name="ride-route" value={index} checked={index === selectedRouteIndex} onChange={() => setSelectedRouteIndex(index)} />
                  <span className="ride-setup-route-label">{index === 0 ? 'Recommended' : `Route ${index + 1}`}{index === selectedRouteIndex ? ' · Selected' : ''}</span>
                  <strong>{(option.route.distanceMeters / 1000).toFixed(1)} km</strong>
                  <span>{Math.max(1, Math.round(option.route.durationSeconds / 60))} min</span>
                </label>
              ))}
            </fieldset>
          )}
          {supported && !isRouting && routeOptions.length === 0 && !routingError && location && <p className="ride-setup-status" role="status">No route options yet. Try calculating again.</p>}
          <p className="ride-setup-attribution">Routes use OpenStreetMap data. Available alternatives depend on the routing service.</p>
        </>
      ) : (
        <div className="ride-setup-review">
          <div className="ride-setup-review-map" aria-label="Selected ride route">
            <MapContainer key={mapTileRetryCount} center={center} zoom={11} scrollWheelZoom className="ride-setup-map">
              <MapSizeObserver />
              <MapTiles onError={() => setMapTilesFailed(true)} />
              {location && <CircleMarker center={[location.lat, location.lng]} radius={7} pathOptions={{ color: '#256af4', fillColor: '#78a5ff', fillOpacity: 1 }} />}
              {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: '#c77726', fillColor: '#f1b35f', fillOpacity: 1 }} />}
              {selectedRoute && <Polyline positions={selectedRoute.coordinates.map(({ lat, lng }) => [lat, lng])} pathOptions={{ color: '#256af4', weight: 6, opacity: 0.9 }} />}
              {selectedRoute && <FitRouteBounds coordinates={selectedRoute.coordinates} />}
            </MapContainer>
            {mapTilesFailed && <div className="ride-setup-map-error" role="status"><span>Some map tiles could not load. Your selected destination is saved in this preview.</span><button type="button" onClick={() => { setMapTilesFailed(false); setMapTileRetryCount((count) => count + 1); }}>Retry map</button></div>}
          </div>
          <div className="ride-setup-review-destination"><span>DESTINATION</span><strong>{destination?.label}</strong><button type="button" onClick={editDestination} disabled={busy}>Edit</button></div>
          {supported ? (
            <div className="ride-setup-review-stats">
              <div><span>RIDE TYPE</span><strong>{mode === 'solo' ? 'Solo ride' : 'Group ride'}</strong></div>
              <div><span>ROUTE</span><strong>{selectedRoute ? (selectedRouteIndex === 0 ? 'Recommended' : `Route ${selectedRouteIndex + 1}`) : 'No preview'}</strong></div>
              <div><span>DISTANCE</span><strong>{selectedRoute ? `${(selectedRoute.distanceMeters / 1000).toFixed(1)} km` : 'Unavailable'}</strong></div>
              <div><span>EST. TIME</span><strong>{selectedRoute ? `${Math.max(1, Math.round(selectedRoute.durationSeconds / 60))} min` : 'Unavailable'}</strong></div>
            </div>
          ) : (
            <div className="ride-setup-notice" role="status">
              <strong>Guidance is unavailable on this device.</strong>
              <span>Your destination will be saved. Turn-by-turn guidance and route estimates are available in the Android app.</span>
            </div>
          )}
          {supported && !selectedRoute && (routingError || locationError) && <p className="ride-setup-notice" role="status">Route preview unavailable: {routingError ?? locationError} You can still start without guidance.</p>}
          <p className="ride-setup-attribution">Map data © OpenStreetMap contributors.</p>
        </div>
      )}

      <footer className="ride-setup-actions">
        {step === 'mode' ? (
          <><button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className="btn-primary" onClick={() => setStep('destination')}>Choose destination</button></>
        ) : step === 'destination' ? (
          <><button type="button" className="btn-secondary" onClick={handleBack} disabled={busy}>Back</button><button type="button" className="btn-primary" onClick={confirmCandidate} disabled={busy || !candidate}>Use destination</button></>
        ) : step === 'routes' ? (
          <><button type="button" className="btn-secondary" onClick={editDestination} disabled={busy}>Edit destination</button>{(routingError || (!location && Boolean(locationError))) ? <button type="button" className="btn-primary" onClick={() => setStep('review')} disabled={busy || isRouting}>Continue without guidance</button> : <button type="button" className="btn-primary" onClick={() => setStep('review')} disabled={!routeOptions.length || busy || isRouting}>Review ride</button>}</>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={supported ? () => setStep('routes') : editDestination} disabled={busy}>{supported ? 'Change route' : 'Edit destination'}</button>
            <button type="button" className="btn-primary" disabled={busy || isRouting || !destination} onClick={() => destination && onContinue(mode, destination, selectedRoute ? selectedRouteIndex : 0)}>
              {busy ? <><IonSpinner name="dots" /> Starting…</> : mode === 'solo' ? 'Start solo ride' : 'Create group ride'}
            </button>
          </>
        )}
      </footer>
    </section>
  );
};

export default RideSetupWizard;
