import { IonSpinner } from '@ionic/react';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateRouteOptions, supportsTurnByTurnNavigation } from '../services/navigationEngine';
import { getCurrentLocationFix } from '../services/currentLocation';
import { PLACE_SEARCH_ATTRIBUTION, searchPlaces, type PlaceSearchResult } from '../services/placeSearch';
import type { LocationPoint, NavigationDestination, NavigationRouteOption } from '../types/ride';

type Props = {
  mode: 'group' | 'solo';
  busy: boolean;
  onCancel: () => void;
  onContinue: (destination: NavigationDestination, routeIndex: number) => void;
};

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

const RideSetupWizard: React.FC<Props> = ({ mode, busy, onCancel, onContinue }) => {
  const supported = supportsTurnByTurnNavigation();
  const [step, setStep] = useState<'destination' | 'routes'>('destination');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [destination, setDestination] = useState<NavigationDestination | null>(null);
  const [routeOptions, setRouteOptions] = useState<NavigationRouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isRouting, setIsRouting] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [routeRetryCount, setRouteRetryCount] = useState(0);
  const lastRouteRequestRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCurrentLocationFix().then((point) => {
      if (!cancelled) {
        setLocation(point);
        setLocationError(null);
      }
    }).catch((error: unknown) => {
      if (!cancelled) setLocationError(error instanceof Error ? error.message : 'Current location is unavailable.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 3 || destination) {
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      void searchPlaces(normalized, { signal: controller.signal, bias: location ?? undefined })
        .then((nextResults) => {
          if (!controller.signal.aborted) {
            setResults(nextResults);
            setSearchError(null);
          }
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
  }, [destination, location, query]);

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    const content = heading.closest('ion-content') as (HTMLElement & {
      getScrollElement?: () => Promise<HTMLElement>;
    }) | null;
    if (content?.getScrollElement) {
      void content.getScrollElement().then((scrollElement) => {
        const target = scrollElement.scrollTop + heading.getBoundingClientRect().top - 88;
        scrollElement.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
      });
    } else {
      heading.scrollIntoView?.({ behavior: 'auto', block: 'start' });
    }
  }, [step]);

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
        if (!options.length) setRoutingError('No routes were found for this destination.');
      })
      .catch((error: unknown) => {
        if (!cancelled) setRoutingError(error instanceof Error ? error.message : 'Could not calculate routes. Check your connection and try again.');
      })
      .finally(() => { if (!cancelled) setIsRouting(false); });
    return () => { cancelled = true; };
  }, [destination, location, routeRetryCount, step, supported]);

  const computeRoutes = async (nextDestination: NavigationDestination) => {
    setDestination(nextDestination);
    setQuery('');
    setResults([]);
    setRouteOptions([]);
    setSelectedRouteIndex(0);
    lastRouteRequestRef.current = null;
    setRoutingError(null);
    setStep('routes');
    if (!supported) return;
    if (!location) {
      setRoutingError(locationError ?? 'Current location is unavailable. Retry location to compare routes.');
      return;
    }
  };

  const center = useMemo<[number, number]>(() => {
    if (destination) return [destination.lat, destination.lng];
    if (location) return [location.lat, location.lng];
    return DEFAULT_CENTER;
  }, [destination, location]);
  const selectedRoute = routeOptions[selectedRouteIndex]?.route;
  const retryLocation = async () => {
    setLocationError(null);
    try {
      const point = await getCurrentLocationFix();
      setLocation(point);
      setLocationError(null);
      lastRouteRequestRef.current = null;
      setRoutingError(null);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Current location is unavailable.');
    }
  };

  const editDestination = () => {
    setDestination(null);
    setRouteOptions([]);
    setRoutingError(null);
    lastRouteRequestRef.current = null;
    setStep('destination');
  };

  return (
    <section className="ride-setup" aria-label="Ride setup">
      <header className="ride-setup-heading" ref={headingRef}>
        <div className="ride-setup-step">Step {step === 'destination' ? '1' : '2'} of 2 · {mode === 'solo' ? 'Solo ride' : 'Group ride'}</div>
        <h2>{step === 'destination' ? 'Where are you headed?' : 'Choose your route'}</h2>
        <p>{step === 'destination'
          ? 'Search for a destination or tap the map to drop a pin.'
          : destination?.label}</p>
      </header>

      {step === 'destination' ? (
        <>
          <div className="ride-setup-search">
            <label htmlFor="ride-destination-search">Destination</label>
            <input
              id="ride-destination-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Place, street, or address"
              autoComplete="off"
            />
          </div>
          {isSearching && <p className="ride-setup-status" role="status"><IonSpinner name="dots" /> Searching places…</p>}
          {searchError && <p className="ride-setup-error" role="alert">{searchError}</p>}
          {!isSearching && !searchError && query.trim().length >= 3 && results.length === 0 && (
            <p className="ride-setup-status" role="status">No places found. Try another search or tap the map.</p>
          )}
          {results.length > 0 && (
            <div className="ride-setup-results" role="listbox" aria-label="Destination search results">
          {results.map((place) => (
                <button key={`${place.lat},${place.lng}`} type="button" role="option" aria-selected="false" onClick={() => void computeRoutes({ lat: place.lat, lng: place.lng, label: place.label })}>
                  <span>{place.label}</span><span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}
          <div className="ride-setup-map-wrap" aria-label="Choose a destination on the map">
            <MapContainer center={center} zoom={12} scrollWheelZoom className="ride-setup-map">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapTap onPick={(lat, lng) => void computeRoutes({ lat, lng, label: `Map pin · ${lat.toFixed(4)}, ${lng.toFixed(4)}` })} />
              {location && <CircleMarker center={[location.lat, location.lng]} radius={7} pathOptions={{ color: '#1c5d4c', fillColor: '#72c6a0', fillOpacity: 1 }} />}
              {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: '#9b6330', fillColor: '#eaa65e', fillOpacity: 1 }} />}
            </MapContainer>
            <span className="ride-setup-map-hint">Tap the map to set destination</span>
          </div>
          <p className="ride-setup-attribution">{PLACE_SEARCH_ATTRIBUTION}</p>
        </>
      ) : (
        <>
          <div className="ride-setup-route-map" aria-label="Route preview">
            <MapContainer center={center} zoom={11} scrollWheelZoom className="ride-setup-map">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {location && <CircleMarker center={[location.lat, location.lng]} radius={7} pathOptions={{ color: '#1c5d4c', fillColor: '#72c6a0', fillOpacity: 1 }} />}
              {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: '#9b6330', fillColor: '#eaa65e', fillOpacity: 1 }} />}
              {routeOptions.map((option, index) => (
                <Polyline key={`${option.label}-${index}`} positions={option.route.coordinates.map(({ lat, lng }) => [lat, lng])} pathOptions={{ color: index === selectedRouteIndex ? '#1c5d4c' : '#75909a', weight: index === selectedRouteIndex ? 6 : 3, opacity: index === selectedRouteIndex ? 0.95 : 0.65 }} />
              ))}
              {selectedRoute && <FitRouteBounds coordinates={selectedRoute.coordinates} />}
            </MapContainer>
          </div>
          {isRouting && <p className="ride-setup-status" role="status"><IonSpinner name="dots" /> Comparing available routes…</p>}
          {!supported && <p className="ride-setup-notice" role="status">Route comparison and turn-by-turn guidance are available in the Android app. You can still save this destination.</p>}
          {supported && !location && (
            <div className="ride-setup-notice" role="status">
              <span>{locationError ?? 'Current location is needed to compare routes.'}</span>
              <button type="button" onClick={() => void retryLocation()}>Retry location</button>
            </div>
          )}
          {routingError && <p className="ride-setup-error" role="alert">{routingError}</p>}
          {routingError && supported && location && (
            <button type="button" className="ride-setup-retry" onClick={() => { lastRouteRequestRef.current = null; setRouteOptions([]); setRoutingError(null); setRouteRetryCount((count) => count + 1); }}>
              Retry route search
            </button>
          )}
          {routeOptions.length > 0 && (
            <div className="ride-setup-route-list" role="radiogroup" aria-label="Available routes">
              {routeOptions.map((option, index) => (
                <button key={`${option.label}-${index}`} type="button" role="radio" aria-checked={index === selectedRouteIndex} className={index === selectedRouteIndex ? 'is-selected' : ''} onClick={() => setSelectedRouteIndex(index)}>
                  <span className="ride-setup-route-label">{index === 0 ? 'Recommended' : `Route ${index + 1}`}</span>
                  <strong>{(option.route.distanceMeters / 1000).toFixed(1)} km</strong>
                  <span>{Math.max(1, Math.round(option.route.durationSeconds / 60))} min</span>
                </button>
              ))}
            </div>
          )}
          {supported && !isRouting && routeOptions.length === 0 && location && !routingError && (
            <p className="ride-setup-status" role="status">No route options yet. Try calculating again.</p>
          )}
          <p className="ride-setup-attribution">Routes use OpenStreetMap data. Available alternatives depend on the routing service.</p>
        </>
      )}

      <footer className="ride-setup-actions">
        {step === 'destination' ? (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={editDestination} disabled={busy}>Edit destination</button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || isRouting || (supported && routeOptions.length === 0 && Boolean(location) && !routingError)}
              onClick={() => destination && onContinue(destination, selectedRouteIndex)}
            >
              {busy ? <><IonSpinner name="dots" /> Starting…</> : routeOptions.length === 0
                ? mode === 'solo' ? 'Start without route preview' : 'Create without route preview'
                : mode === 'solo' ? 'Start solo ride' : 'Create group ride'}
            </button>
          </>
        )}
      </footer>
    </section>
  );
};

export default RideSetupWizard;
