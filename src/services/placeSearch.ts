/**
 * Online destination search using the public Photon demo service.
 *
 * Callers own debounce and caching. Results are restricted to the Philippines
 * with Photon's bbox/country filters and a local
 * coordinate check. Display `PLACE_SEARCH_ATTRIBUTION` alongside results.
 */

export const PHOTON_SEARCH_ENDPOINT = 'https://photon.komoot.io/api/';
export const PLACE_SEARCH_ATTRIBUTION =
  'Geocoding by Photon · © OpenStreetMap contributors';

/** Philippines envelope with a small margin, expressed as [minLon, minLat, maxLon, maxLat]. */
export const PHILIPPINES_SEARCH_BOUNDS = [116.0, 4.0, 127.0, 22.0] as const;

export const MAX_PLACE_SEARCH_RESULTS = 10;
export const PLACE_SEARCH_CACHE_TTL_MS = 60_000;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;
const placeSearchCache = new Map<string, { expiresAt: number; results: PlaceSearchResult[] }>();

export const clearPlaceSearchCache = () => placeSearchCache.clear();

export type PlaceSearchResult = {
  label: string;
  lat: number;
  lng: number;
  attribution: string;
};

export type PlaceSearchErrorCode =
  | 'aborted'
  | 'network'
  | 'http'
  | 'invalid-response';

export class PlaceSearchError extends Error {
  readonly code: PlaceSearchErrorCode;

  constructor(code: PlaceSearchErrorCode, message: string) {
    super(message);
    this.name = 'PlaceSearchError';
    this.code = code;
  }
}

export type PlaceSearchOptions = {
  signal?: AbortSignal;
  /** Current location biases ranking while the Philippines bounding box remains enforced. */
  bias?: { lat: number; lng: number };
};

type PhotonFeature = {
  type?: unknown;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isWithinPilotBounds = (lng: number, lat: number): boolean => {
  const [minLng, minLat, maxLng, maxLat] = PHILIPPINES_SEARCH_BOUNDS;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
};

const uniqueParts = (parts: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  return parts.filter((part): part is string => {
    if (!part) return false;
    const key = part.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parseFeature = (feature: PhotonFeature): PlaceSearchResult | null => {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties;
  if (
    feature.type !== 'Feature' ||
    feature.geometry?.type !== 'Point' ||
    !Array.isArray(coordinates) ||
    !isFiniteCoordinate(coordinates[0]) ||
    !isFiniteCoordinate(coordinates[1]) ||
    !properties
  ) {
    return null;
  }

  const [lng, lat] = coordinates;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90 || !isWithinPilotBounds(lng, lat)) {
    return null;
  }

  const street = asText(properties.street);
  const houseNumber = asText(properties.housenumber);
  const addressLine = [street, houseNumber].filter(Boolean).join(' ');
  const name =
    asText(properties.name) ??
    addressLine ??
    asText(properties.city) ??
    asText(properties.locality);
  if (!name) return null;

  const locality =
    asText(properties.city) ??
    asText(properties.locality) ??
    asText(properties.district);
  const label = uniqueParts([
    name,
    addressLine,
    locality,
    asText(properties.state),
    asText(properties.country),
  ]).join(', ');

  return {
    label,
    lat,
    lng,
    attribution: PLACE_SEARCH_ATTRIBUTION,
  };
};

/** Search the public Photon demo. This function deliberately does not debounce. */
export async function searchPlaces(
  query: string,
  options: PlaceSearchOptions = {},
): Promise<PlaceSearchResult[]> {
  const normalizedQuery = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (normalizedQuery.length < MIN_QUERY_LENGTH) return [];

  if (options.signal?.aborted) {
    throw new PlaceSearchError('aborted', 'Place search was cancelled.');
  }

  const roundedLatitude = options.bias ? Math.round(options.bias.lat * 100) / 100 : '';
  const roundedLongitude = options.bias ? Math.round(options.bias.lng * 100) / 100 : '';
  const cacheKey = `${normalizedQuery.toLocaleLowerCase()}|${roundedLatitude}|${roundedLongitude}`;
  const cached = placeSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;
  if (cached) placeSearchCache.delete(cacheKey);

  const url = new URL(PHOTON_SEARCH_ENDPOINT);
  url.searchParams.set('q', normalizedQuery);
  url.searchParams.set('limit', String(MAX_PLACE_SEARCH_RESULTS));
  url.searchParams.set('countrycode', 'PH');
  url.searchParams.set('bbox', PHILIPPINES_SEARCH_BOUNDS.join(','));
  if (
    options.bias &&
    Number.isFinite(options.bias.lat) &&
    Number.isFinite(options.bias.lng) &&
    isWithinPilotBounds(options.bias.lng, options.bias.lat)
  ) {
    url.searchParams.set('lat', String(options.bias.lat));
    url.searchParams.set('lon', String(options.bias.lng));
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: options.signal });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new PlaceSearchError('aborted', 'Place search was cancelled.');
    }
    throw new PlaceSearchError('network', 'Could not reach the place search service.');
  }

  if (!response.ok) {
    throw new PlaceSearchError(
      'http',
      `Place search service returned HTTP ${response.status}. Try again when online.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PlaceSearchError('invalid-response', 'Place search returned unreadable data.');
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('features' in payload) ||
    !Array.isArray(payload.features)
  ) {
    throw new PlaceSearchError('invalid-response', 'Place search returned an unexpected response.');
  }

  const results = payload.features
    .flatMap((feature: unknown) => {
      if (typeof feature !== 'object' || feature === null) return [];
      const parsed = parseFeature(feature as PhotonFeature);
      return parsed ? [parsed] : [];
    })
    .slice(0, MAX_PLACE_SEARCH_RESULTS);
  if (placeSearchCache.size >= 50) {
    const firstKey = placeSearchCache.keys().next().value;
    if (firstKey) placeSearchCache.delete(firstKey);
  }
  placeSearchCache.set(cacheKey, {
    expiresAt: Date.now() + PLACE_SEARCH_CACHE_TTL_MS,
    results,
  });
  return results;
}
