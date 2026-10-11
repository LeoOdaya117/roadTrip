import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlaceSearchCache,
  MAX_PLACE_SEARCH_RESULTS,
  PHILIPPINES_SEARCH_BOUNDS,
  PLACE_SEARCH_ATTRIBUTION,
  searchPlaces,
} from './placeSearch';

const feature = (
  name: string,
  coordinates: [number, number],
  properties: Record<string, unknown> = {},
) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: { name, country: 'Philippines', osm_type: 'N', osm_id: 42, ...properties },
});

const jsonResponse = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('Photon place search', () => {
  afterEach(() => {
    clearPlaceSearchCache();
    vi.unstubAllGlobals();
  });

  it('requests Philippines results in the country bounding box and maps valid results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        type: 'FeatureCollection',
        features: [
          feature('Tagaytay', [120.95, 14.1], { city: 'Tagaytay', state: 'Cavite' }),
          feature('Outside the Philippines', [130.0, 16.0]),
          feature('No coordinates', [Number.NaN, 14]),
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchPlaces(' Tagaytay ', { bias: { lat: 14.1, lng: 120.95 } });
    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as URL);

    expect(requestedUrl.searchParams.get('q')).toBe('Tagaytay');
    expect(requestedUrl.searchParams.get('countrycode')).toBe('PH');
    expect(requestedUrl.searchParams.get('bbox')).toBe(PHILIPPINES_SEARCH_BOUNDS.join(','));
    expect(requestedUrl.searchParams.get('limit')).toBe(String(MAX_PLACE_SEARCH_RESULTS));
    expect(requestedUrl.searchParams.get('lat')).toBe('14.1');
    expect(requestedUrl.searchParams.get('lon')).toBe('120.95');
    expect(results).toEqual([
      {
        label: 'Tagaytay, Cavite, Philippines',
        lat: 14.1,
        lng: 120.95,
        attribution: PLACE_SEARCH_ATTRIBUTION,
      },
    ]);
    expect(PLACE_SEARCH_ATTRIBUTION).toContain('OpenStreetMap');
    expect(PLACE_SEARCH_ATTRIBUTION).toContain('Photon');
  });

  it('accepts results from across the country, including Mindanao', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ features: [feature('Davao City', [125.61, 7.07])] }),
    ));

    await expect(searchPlaces('Davao City')).resolves.toEqual([
      expect.objectContaining({ label: 'Davao City, Philippines', lat: 7.07, lng: 125.61 }),
    ]);
  });

  it('skips short queries and bounds result count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ features: Array.from({ length: 12 }, (_, i) => feature(`Place ${i}`, [121, 14])) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await searchPlaces('x')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await searchPlaces('places')).length).toBe(MAX_PLACE_SEARCH_RESULTS);
    expect(new URL(fetchMock.mock.calls[0][0] as URL).searchParams.get('limit')).toBe(
      String(MAX_PLACE_SEARCH_RESULTS),
    );
  });

  it('returns no results when an aborted signal is passed before the request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchPlaces('Manila', { signal: controller.signal })).rejects.toMatchObject({
      code: 'aborted',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards an active abort signal to fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchPlaces('Manila', { signal: controller.signal });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });

  it('caches successful searches briefly to limit demo service traffic', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ features: [feature('Manila', [121, 14])] }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await searchPlaces('Manila');
    const second = await searchPlaces('manila');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes network and HTTP failures as recoverable service errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(searchPlaces('Manila')).rejects.toMatchObject({ code: 'network' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    await expect(searchPlaces('Manila')).rejects.toMatchObject({ code: 'http' });
  });

  it('rejects malformed Photon payloads and unreadable JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ places: [] })));
    await expect(searchPlaces('Manila')).rejects.toMatchObject({ code: 'invalid-response' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
      }),
    );
    await expect(searchPlaces('Manila')).rejects.toMatchObject({ code: 'invalid-response' });
  });
});
