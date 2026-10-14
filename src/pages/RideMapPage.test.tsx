import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRideStore } from '../store/rideStore';

const mocks = vi.hoisted(() => ({
  routeRideId: 'solo-test-ride',
  platform: 'web',
  trackerHasFreshLocation: true,
  trackerIsTracking: true,
  trackerLocation: {
    lat: 14.6,
    lng: 121.0,
    speed: 0,
    accuracy: 5,
    timestamp: '2026-10-10T00:00:00.000Z',
    pointId: 'point-1',
    segmentId: 'segment-current',
    source: 'foreground' as const,
  } as {
    lat: number;
    lng: number;
    speed: number | null;
    accuracy: number;
    timestamp: string;
    pointId: string;
    segmentId: string;
    source: 'foreground' | 'background';
  } | null,
  trackerError: null as string | null,
  navigationFreshness: null as boolean | null,
  navigationState: {} as Record<string, unknown>,
  pageMap: {
    getZoom: vi.fn(() => 17),
    setView: vi.fn(),
  },
  historyPush: vi.fn(),
  getSession: vi.fn(),
  getTrackPoints: vi.fn(),
  saveRideSession: vi.fn(),
  saveRideProgress: vi.fn(),
  updateRideSession: vi.fn(),
  appendTrackEvent: vi.fn(),
  getLastLocation: vi.fn(),
  addPhoto: vi.fn(),
  startTracking: vi.fn(),
  stopTracking: vi.fn(),
  startNewSegment: vi.fn(),
  persistLocation: vi.fn(),
  flushPendingLocations: vi.fn(),
  pauseTimer: vi.fn(),
  resumeTimer: vi.fn(),
  startTimer: vi.fn(),
  resetTimer: vi.fn(),
  setElapsed: vi.fn(),
  setRunning: vi.fn(),
  savedPlaces: [] as Array<{
    id: string;
    kind: 'home' | 'work' | 'custom';
    name: string;
    addressLabel: string;
    lat: number;
    lng: number;
  }>,
  savePlace: vi.fn(),
}));

vi.mock('@ionic/react', () => ({
  IonPage: ({ children }: PropsWithChildren) => <div>{children}</div>,
  IonContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
  IonToast: ({ isOpen, message, buttons }: {
    isOpen: boolean;
    message: string;
    buttons?: Array<{ text: string; handler?: () => void }>;
  }) => isOpen ? (
    <div role="status">
      {message}
      {buttons?.map((button) => (
        <button type="button" key={button.text} onClick={button.handler}>{button.text}</button>
      ))}
    </div>
  ) : null,
  IonIcon: () => null,
  IonInput: ({ value, placeholder, onIonInput, onIonChange }: {
    value: string;
    placeholder: string;
    onIonInput: (event: CustomEvent<{ value: string }>) => void;
    onIonChange: (event: CustomEvent<{ value: string }>) => void;
  }) => (
    <input
      aria-label={placeholder}
      value={value}
      onChange={(event) => {
        const detail = { detail: { value: event.currentTarget.value } } as CustomEvent<{ value: string }>;
        onIonInput(detail);
        onIonChange(detail);
      }}
    />
  ),
  IonButton: ({ children, onClick, disabled }: PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));

vi.mock('react-router-dom', () => ({
  useHistory: () => ({ push: mocks.historyPush }),
  useParams: () => ({ rideId: mocks.routeRideId }),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform } }));
vi.mock('../hooks/useLocationTracker', () => ({
  useLocationTracker: () => ({
    location: mocks.trackerLocation,
    hasFreshLocation: mocks.trackerHasFreshLocation,
    isTracking: mocks.trackerIsTracking,
    permission: 'granted',
    error: mocks.trackerError,
    quality: { acceptedCount: 1, rejectedCount: 0, lastRejectedReason: null },
    startTracking: mocks.startTracking,
    stopTracking: mocks.stopTracking,
    startNewSegment: mocks.startNewSegment,
  }),
}));
vi.mock('../hooks/useRideNavigation', () => ({
  useRideNavigation: (...args: unknown[]) => {
    mocks.navigationFreshness = args[3] === true;
    return mocks.navigationState;
  },
}));
vi.mock('../hooks/useSavedPlaces', () => ({
  useSavedPlaces: () => ({
    savedPlaces: mocks.savedPlaces,
    isLoading: false,
    loadError: null,
    refresh: vi.fn(),
    save: mocks.savePlace,
    remove: vi.fn(),
  }),
}));
vi.mock('../hooks/useMockRiders', () => ({ useMockRiders: vi.fn() }));
vi.mock('../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));
vi.mock('../hooks/useRideChannel', () => ({ useRideChannel: vi.fn() }));
vi.mock('../hooks/useRideLocationSync', () => ({
  useRideLocationSync: () => ({ syncStatus: null, persistenceError: null, pendingOutboxCount: 0, persistLocation: mocks.persistLocation, flushPendingLocations: mocks.flushPendingLocations }),
}));
vi.mock('../hooks/useRideTimer', () => ({
  useRideTimer: () => ({
    elapsedSeconds: 42,
    isRunning: true,
    formatted: '00:42',
    start: mocks.startTimer,
    pause: mocks.pauseTimer,
    resume: mocks.resumeTimer,
    reset: mocks.resetTimer,
    setElapsed: mocks.setElapsed,
    setRunning: mocks.setRunning,
  }),
}));
vi.mock('../services/offlineDb', () => ({
  addPhoto: mocks.addPhoto,
  appendTrackEvent: mocks.appendTrackEvent,
  getLastLocation: mocks.getLastLocation,
  getSession: mocks.getSession,
  getTrackPoints: mocks.getTrackPoints,
  saveRideProgress: mocks.saveRideProgress,
  saveRideSession: mocks.saveRideSession,
  updateRideSession: mocks.updateRideSession,
}));
vi.mock('../services/mapPreferences', () => ({
  loadMapMarkerStyle: () => 'circle',
  saveMapMarkerStyle: vi.fn(),
}));
vi.mock('../services/placeSearch', () => ({ searchPlaces: vi.fn() }));
vi.mock('../components/RideMapView', () => ({
  default: function RideMapViewMock({
    followLocation,
    trackPoints,
    onFollowInterrupted,
    onMapReady,
  }: {
    followLocation?: { lat: number; lng: number } | null;
    trackPoints?: Array<{ lat: number; lng: number }>;
    onFollowInterrupted?: () => void;
    onMapReady?: (map: { getZoom: () => number; setView: (center: [number, number], zoom: number) => unknown }) => void;
  }) {
    useEffect(() => {
      onMapReady?.(mocks.pageMap as unknown as {
        getZoom: () => number;
        setView: (center: [number, number], zoom: number) => unknown;
      });
    }, [onMapReady]);

    return (
      <div
        data-testid="ride-map"
        data-follow-target={followLocation ? `${followLocation.lat},${followLocation.lng}` : ''}
        data-track={JSON.stringify(trackPoints)}
      >
        <button type="button" aria-label="Simulate map drag" onClick={onFollowInterrupted} />
      </div>
    );
  },
}));
vi.mock('../components/RideMapRideActions', () => ({
  default: ({ onToggleTracking, onEndRide, isTracking, busy }: {
    onToggleTracking: () => void;
    onEndRide: () => void;
    isTracking: boolean;
    busy: boolean;
  }) => (
    <div>
      <button type="button" onClick={onToggleTracking} disabled={busy}>
        {isTracking ? 'Pause ride' : 'Resume ride'}
      </button>
      <button type="button" onClick={onEndRide} disabled={busy}>End ride</button>
    </div>
  ),
}));
vi.mock('../components/BottomSheet', () => ({
  default: ({ isOpen, children, footer, onDidDismiss, ariaLabel }: PropsWithChildren<{
    isOpen: boolean;
    footer?: ReactNode;
    onDidDismiss: () => void;
    ariaLabel?: string;
  }>) => isOpen ? (
    <div role="dialog" aria-label={ariaLabel}>
      <button type="button" data-testid="dismiss-sheet" onClick={onDidDismiss}>Dismiss sheet</button>
      {children}{footer}
    </div>
  ) : null,
}));
vi.mock('../components/MapStyleSwitcher', () => ({ default: () => null }));
vi.mock('../components/RideMap/NavigationPanel', () => ({
  default: ({
    onClose,
    hasLocation,
    savedPlaces,
    onSelectSavedPlace,
  }: {
    onClose: () => void;
    hasLocation: boolean;
    savedPlaces: typeof mocks.savedPlaces;
    onSelectSavedPlace: (place: (typeof mocks.savedPlaces)[number]) => void;
  }) => (
    <section aria-label="Destination panel" data-location-fresh={hasLocation}>
      {savedPlaces.map((place) => (
        <button type="button" key={place.id} onClick={() => onSelectSavedPlace(place)}>{place.name}</button>
      ))}
      <button type="button" onClick={onClose}>Close navigation panel</button>
    </section>
  ),
}));

import RideMapPage from './RideMapPage';

const activeSession = {
  rideId: 'solo-test-ride',
  userId: 'rider-1',
  userName: 'Rider',
  isHost: true,
  isSolo: true,
  createdAt: '2026-10-10T00:00:00.000Z',
  durationSeconds: 30,
  activeSegmentId: 'segment-current',
  status: 'active' as const,
};

const renderRideMap = (isTracking: boolean, isSoloMode = true) => {
  mocks.routeRideId = isSoloMode ? 'solo-test-ride' : 'group-test-ride';
  useRideStore.setState({
    currentUser: { id: 'rider-1', name: 'Rider', isHost: true },
    rideId: mocks.routeRideId,
    riders: {},
    messages: [],
    currentTopic: null,
    isTracking,
    isSoloMode,
  });
  return render(<RideMapPage />);
};

describe('RideMapPage ride lifecycle actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform = 'web';
    mocks.trackerHasFreshLocation = true;
    mocks.trackerIsTracking = true;
    mocks.trackerLocation = {
      lat: 14.6,
      lng: 121.0,
      speed: 0,
      accuracy: 5,
      timestamp: '2026-10-10T00:00:00.000Z',
      pointId: 'point-1',
      segmentId: 'segment-current',
      source: 'foreground',
    };
    mocks.trackerError = null;
    mocks.navigationFreshness = null;
    mocks.navigationState = {
      destination: null,
      route: null,
      error: null,
      isGuiding: false,
      isRouting: false,
      nextInstruction: null,
      nextStreetName: null,
      distanceToNextManeuverMeters: null,
      supported: false,
      offlineAvailable: false,
      isDownloadingTiles: false,
      tileDownloadProgress: null,
      setDestination: vi.fn(),
      startGuidance: vi.fn(),
      stopGuidance: vi.fn(),
      clearDestination: vi.fn(),
      downloadTiles: vi.fn(),
    };
    mocks.savedPlaces = [];
    mocks.savePlace.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(activeSession);
    mocks.getLastLocation.mockResolvedValue(undefined);
    mocks.getTrackPoints.mockResolvedValue([]);
    mocks.saveRideSession.mockResolvedValue(undefined);
    mocks.saveRideProgress.mockResolvedValue(undefined);
    mocks.updateRideSession.mockResolvedValue(1);
    mocks.appendTrackEvent.mockResolvedValue(undefined);
    mocks.startTracking.mockResolvedValue(undefined);
    mocks.flushPendingLocations.mockResolvedValue(undefined);
    mocks.startNewSegment.mockReturnValue('segment-next');
    mocks.addPhoto.mockResolvedValue(1);
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({ drawImage: vi.fn() }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) => callback(new Blob(['image'])),
    });
    vi.stubGlobal('Image', class MockImage {
      width = 640;
      height = 480;
      onload: (() => void) | null = null;
      onerror: ((error: unknown) => void) | null = null;
      set src(_value: string) { this.onload?.(); }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useRideStore.setState({ rideId: undefined, isTracking: false, isSoloMode: false, riders: {}, messages: [] });
  });

  it('keeps follow off by default and exposes a separate follow toggle and one-shot center action', () => {
    renderRideMap(true);

    const followButton = screen.getByRole('button', { name: 'Follow my location' });
    expect(followButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Center map on your location' })).toBeInTheDocument();
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '');

    fireEvent.click(followButton);
    expect(followButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '14.6,121');

    fireEvent.click(followButton);
    expect(followButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '');
  });

  it('centers on the accepted location and preserves the current Leaflet zoom', () => {
    mocks.trackerLocation = {
      lat: 14.72,
      lng: 121.11,
      speed: 0,
      accuracy: 5,
      timestamp: '2026-10-10T00:00:01.000Z',
      pointId: 'point-center-test',
      segmentId: 'segment-current',
      source: 'foreground',
    };
    renderRideMap(true);
    mocks.pageMap.getZoom.mockClear();
    mocks.pageMap.setView.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Center map on your location' }));

    expect(mocks.pageMap.getZoom).toHaveBeenCalledOnce();
    expect(mocks.pageMap.setView).toHaveBeenCalledOnce();
    expect(mocks.pageMap.setView).toHaveBeenCalledWith([14.72, 121.11], 17);
  });

  it('applies an enabled follow mode when the accepted location becomes available', () => {
    mocks.trackerLocation = null;
    const view = renderRideMap(true);

    fireEvent.click(screen.getByRole('button', { name: 'Follow my location' }));
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '');

    act(() => {
      mocks.trackerLocation = {
        lat: 14.6,
        lng: 121.0,
        speed: 0,
        accuracy: 5,
        timestamp: '2026-10-10T00:00:00.000Z',
        pointId: 'point-1',
        segmentId: 'segment-current',
        source: 'foreground',
      };
      view.rerender(<RideMapPage />);
    });

    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '14.6,121');
  });

  it('retains follow intent while paused and supplies the accepted location again on resume', async () => {
    mocks.getSession.mockResolvedValue({ ...activeSession, status: 'paused' as const });
    renderRideMap(false);

    const followButton = screen.getByRole('button', { name: 'Follow my location' });
    fireEvent.click(followButton);
    expect(followButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '');

    fireEvent.click(screen.getByRole('button', { name: 'Resume ride' }));

    await waitFor(() => expect(useRideStore.getState().isTracking).toBe(true));
    expect(followButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '14.6,121');
  });

  it('disengages follow after a map drag and resets the control when the ride changes', async () => {
    const view = renderRideMap(true);
    const followButton = screen.getByRole('button', { name: 'Follow my location' });
    fireEvent.click(followButton);
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '14.6,121');

    fireEvent.click(screen.getByRole('button', { name: 'Simulate map drag' }));
    expect(followButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '');

    fireEvent.click(followButton);
    act(() => {
      mocks.routeRideId = 'solo-next-ride';
      useRideStore.setState({ rideId: mocks.routeRideId });
      view.rerender(<RideMapPage />);
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Follow my location' })).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByTestId('ride-map')).toHaveAttribute('data-follow-target', '');
  });

  it('clears the previous ride track when Ionic reuses the route component', async () => {
    mocks.trackerLocation = null;
    mocks.getTrackPoints.mockImplementation(async (id: string) => id === 'solo-test-ride'
      ? [{ lat: 14.6, lng: 121, timestamp: '2026-10-10T00:00:00.000Z', segmentId: 'old' }]
      : [{ lat: 15.1, lng: 121.1, timestamp: '2026-10-11T00:00:00.000Z', segmentId: 'new' }]);
    const view = renderRideMap(true);
    await waitFor(() => expect(screen.getByTestId('ride-map').getAttribute('data-track')).toContain('14.6'));
    const oldMap = screen.getByTestId('ride-map');
    act(() => {
      mocks.routeRideId = 'solo-next-ride';
      view.rerender(<RideMapPage />);
    });
    await waitFor(() => expect(screen.getByTestId('ride-map').getAttribute('data-track')).toContain('15.1'));
    expect(screen.getByTestId('ride-map')).not.toBe(oldMap);
    expect(screen.getByTestId('ride-map').getAttribute('data-track')).not.toContain('14.6');
    expect(mocks.stopTracking).toHaveBeenCalled();
  });

  it('ignores an old ride track load resolving after the route changes', async () => {
    mocks.trackerLocation = null;
    let finishOldLoad!: (points: unknown[]) => void;
    const oldLoad = new Promise<unknown[]>((resolve) => { finishOldLoad = resolve; });
    mocks.getTrackPoints.mockImplementation((id: string) => id === 'solo-test-ride'
      ? oldLoad
      : Promise.resolve([{ lat: 15.1, lng: 121.1, timestamp: '2026-10-11T00:00:00.000Z', segmentId: 'new' }]));
    const view = renderRideMap(true);
    act(() => {
      mocks.routeRideId = 'solo-next-ride';
      view.rerender(<RideMapPage />);
    });
    await waitFor(() => expect(screen.getByTestId('ride-map').getAttribute('data-track')).toContain('15.1'));
    await act(async () => finishOldLoad([{ lat: 14.6, lng: 121, timestamp: '2026-10-10T00:00:00.000Z', segmentId: 'old' }]));
    expect(screen.getByTestId('ride-map').getAttribute('data-track')).not.toContain('14.6');
  });

  it('keeps tracker permission errors actionable and retries only when requested', async () => {
    mocks.platform = 'android';
    mocks.trackerIsTracking = false;
    mocks.trackerError = 'Background location is not enabled.';
    const intervalSpy = vi.spyOn(window, 'setInterval');
    renderRideMap(true);

    expect(await screen.findByRole('status')).toHaveTextContent('Background location is not enabled.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 3500)).toBe(false);
    expect(mocks.startTracking).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mocks.startTracking).toHaveBeenCalledTimes(2));
    expect(mocks.stopTracking).toHaveBeenCalledOnce();
  });

  it('stops GPS and drains accepted coordinates before saving the stopover and pausing the timer', async () => {
    renderRideMap(true);

    fireEvent.click(screen.getByRole('button', { name: 'Pause ride' }));

    await waitFor(() => expect(mocks.pauseTimer).toHaveBeenCalled());
    expect(mocks.appendTrackEvent).toHaveBeenCalledWith(
      'solo-test-ride',
      expect.objectContaining({ pointId: 'point-1' }),
      'stopover',
    );
    expect(mocks.updateRideSession).toHaveBeenCalledWith('solo-test-ride', { status: 'paused' });
    expect(mocks.stopTracking).toHaveBeenCalled();
    expect(mocks.flushPendingLocations).toHaveBeenCalledOnce();
    expect(mocks.flushPendingLocations.mock.invocationCallOrder[0]).toBeLessThan(mocks.appendTrackEvent.mock.invocationCallOrder[0]);
    expect(mocks.pauseTimer).toHaveBeenCalled();
  });

  it('keeps tracking active and reports an error when pause persistence fails', async () => {
    mocks.updateRideSession.mockRejectedValue(new Error('storage unavailable'));
    renderRideMap(true);

    fireEvent.click(screen.getByRole('button', { name: 'Pause ride' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Could not pause ride');
    expect(useRideStore.getState().isTracking).toBe(true);
    expect(mocks.stopTracking).toHaveBeenCalled();
    await waitFor(() => expect(mocks.startTracking).toHaveBeenCalledTimes(2));
  });

  it('starts a new segment and persists it before resuming the ride', async () => {
    const paused = { ...activeSession, status: 'paused' as const };
    mocks.getSession.mockResolvedValue(paused);
    renderRideMap(false);

    fireEvent.click(screen.getByRole('button', { name: 'Resume ride' }));

    await waitFor(() => expect(useRideStore.getState().isTracking).toBe(true));
    expect(mocks.startNewSegment).toHaveBeenCalled();
    expect(mocks.startTracking).toHaveBeenCalled();
    expect(mocks.updateRideSession).toHaveBeenCalledWith('solo-test-ride', expect.objectContaining({
      status: 'active',
      activeSegmentId: 'segment-next',
    }));
    expect(mocks.resumeTimer).toHaveBeenCalled();
  });

  it('stops a newly started provider and remains paused when resume persistence fails', async () => {
    mocks.getSession.mockResolvedValue({ ...activeSession, status: 'paused' });
    mocks.updateRideSession.mockRejectedValue(new Error('storage unavailable'));
    renderRideMap(false);

    fireEvent.click(screen.getByRole('button', { name: 'Resume ride' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Could not resume ride');
    expect(useRideStore.getState().isTracking).toBe(false);
    expect(mocks.stopTracking).toHaveBeenCalled();
    expect(mocks.resumeTimer).not.toHaveBeenCalled();
  });

  it('ends the ride only after its final session is persisted', async () => {
    renderRideMap(true);

    fireEvent.click(screen.getByRole('button', { name: 'End ride' }));

    await waitFor(() => expect(mocks.historyPush).toHaveBeenCalledWith('/home'));
    expect(mocks.saveRideSession).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ended',
      endedAt: expect.any(String),
      distanceMeters: expect.any(Number),
      durationSeconds: expect.any(Number),
    }));
    expect(useRideStore.getState().rideId).toBeUndefined();
    expect(mocks.stopTracking).toHaveBeenCalled();
    expect(mocks.resetTimer).toHaveBeenCalled();
  });

  it('keeps the ride active and on the map when final session persistence fails', async () => {
    mocks.saveRideSession.mockRejectedValue(new Error('storage unavailable'));
    renderRideMap(true);

    fireEvent.click(screen.getByRole('button', { name: 'End ride' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Could not end ride');
    expect(useRideStore.getState().rideId).toBe('solo-test-ride');
    expect(useRideStore.getState().isTracking).toBe(true);
    expect(mocks.stopTracking).toHaveBeenCalled();
    expect(mocks.resetTimer).not.toHaveBeenCalled();
    expect(mocks.historyPush).not.toHaveBeenCalled();
  });

  it('waits for pending background writes and derives final distance from the saved track', async () => {
    let finishWrites!: () => void;
    mocks.flushPendingLocations.mockReturnValue(new Promise<void>((resolve) => { finishWrites = resolve; }));
    renderRideMap(true);
    fireEvent.click(screen.getByRole('button', { name: 'End ride' }));
    await waitFor(() => expect(mocks.flushPendingLocations).toHaveBeenCalledOnce());
    expect(mocks.saveRideSession).not.toHaveBeenCalled();
    expect(mocks.historyPush).not.toHaveBeenCalled();
    mocks.getTrackPoints.mockResolvedValue([
      { lat: 14.6, lng: 121, segmentId: 'segment-current', timestamp: '2026-10-10T00:00:00.000Z' },
      { lat: 14.601, lng: 121, segmentId: 'segment-current', timestamp: '2026-10-10T00:00:10.000Z' },
    ]);
    await act(async () => finishWrites());
    await waitFor(() => expect(mocks.historyPush).toHaveBeenCalledWith('/home'));
    const saved = mocks.saveRideSession.mock.calls[0][0];
    expect(saved.distanceMeters).toBeGreaterThan(100);
  });

  it('keeps the ride resumable when draining background coordinates fails', async () => {
    mocks.flushPendingLocations.mockRejectedValue(new Error('Track storage unavailable'));
    renderRideMap(true);
    fireEvent.click(screen.getByRole('button', { name: 'End ride' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not end ride: Track storage unavailable');
    expect(mocks.saveRideSession).not.toHaveBeenCalled();
    expect(useRideStore.getState().rideId).toBe('solo-test-ride');
    expect(useRideStore.getState().isTracking).toBe(true);
    expect(mocks.historyPush).not.toHaveBeenCalled();
  });

  it('persists the caption typed into the photo sheet', async () => {
    renderRideMap(true);
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [new File(['photo'], 'ride.jpg', { type: 'image/jpeg' })] },
    });

    const caption = await screen.findByRole('textbox', { name: 'Add a note or caption' });
    fireEvent.change(caption, { target: { value: 'A saved memory' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    await waitFor(() => expect(mocks.addPhoto).toHaveBeenCalledWith(expect.objectContaining({
      rideId: 'solo-test-ride',
      note: 'A saved memory',
    })));
  });

  it('keeps the photo draft and caption available for retry after a save failure', async () => {
    mocks.addPhoto.mockRejectedValueOnce(new Error('storage unavailable'));
    renderRideMap(true);
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['photo'], 'ride.jpg', { type: 'image/jpeg' })] },
    });
    const caption = await screen.findByRole('textbox', { name: 'Add a note or caption' });
    fireEvent.change(caption, { target: { value: 'Retry this memory' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your photo and caption are still here');
    expect(screen.getByRole('dialog', { name: 'Save ride photo' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Add a note or caption' })).toHaveValue('Retry this memory');

    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
    await waitFor(() => expect(mocks.addPhoto).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save ride photo' })).not.toBeInTheDocument());
    expect(mocks.addPhoto).toHaveBeenLastCalledWith(expect.objectContaining({ note: 'Retry this memory' }));
  });

  it('prevents duplicate photo records while a save is in progress', async () => {
    let finishSave: ((id: number) => void) | undefined;
    mocks.addPhoto.mockReturnValueOnce(new Promise<number>((resolve) => { finishSave = resolve; }));
    renderRideMap(true);
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['photo'], 'ride.jpg', { type: 'image/jpeg' })] },
    });
    const caption = await screen.findByRole('textbox', { name: 'Add a note or caption' });
    fireEvent.change(caption, { target: { value: 'One copy only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));

    const savingButton = await screen.findByRole('button', { name: 'Saving…' });
    expect(savingButton).toBeDisabled();
    fireEvent.click(savingButton);
    expect(mocks.addPhoto).toHaveBeenCalledTimes(1);
    await act(async () => { finishSave?.(1); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save ride photo' })).not.toBeInTheDocument());
    expect(mocks.addPhoto).toHaveBeenCalledTimes(1);
  });

  it('clears the photo caption when the sheet is dismissed before the next capture', async () => {
    renderRideMap(true);
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['first'], 'first.jpg', { type: 'image/jpeg' })] },
    });
    const firstCaption = await screen.findByRole('textbox', { name: 'Add a note or caption' });
    fireEvent.change(firstCaption, { target: { value: 'Old memory' } });
    fireEvent.click(screen.getByTestId('dismiss-sheet'));
    expect(screen.queryByRole('dialog', { name: 'Save ride photo' })).not.toBeInTheDocument();

    fireEvent.change(fileInput, {
      target: { files: [new File(['second'], 'second.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByRole('textbox', { name: 'Add a note or caption' })).toHaveValue('');
  });

  it('discloses that group messages are local-only before the rider composes one', () => {
    renderRideMap(true, false);

    fireEvent.click(screen.getByRole('button', { name: 'Expand ride controls' }));

    expect(screen.getByRole('note')).toHaveTextContent(
      'Messages and topic updates are stored on this device only. Your crew won’t receive them.',
    );
  });

  it('keeps the active guidance banner visible when the optional destination panel closes', async () => {
    mocks.platform = 'android';
    mocks.navigationState = {
      destination: { lat: 14.6, lng: 121, label: 'Destination' },
      route: { coordinates: [{ lat: 14.6, lng: 121 }, { lat: 14.7, lng: 121 }], maneuvers: [], distanceMeters: 100, durationSeconds: 60 },
      error: null,
      isGuiding: true,
      isRouting: false,
      nextInstruction: 'Turn right',
      nextStreetName: 'Highland Avenue',
      distanceToNextManeuverMeters: 120,
      supported: true,
      offlineAvailable: true,
      isDownloadingTiles: false,
      tileDownloadProgress: null,
      setDestination: vi.fn(),
      startGuidance: vi.fn(),
      stopGuidance: vi.fn(),
      clearDestination: vi.fn(),
      downloadTiles: vi.fn(),
    };
    renderRideMap(true);

    const banner = await screen.findByLabelText('Turn-by-turn guidance');
    expect(banner).toHaveTextContent('120 m');
    expect(banner).toHaveTextContent('Turn right');
    expect(screen.getByRole('region', { name: 'Destination panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close navigation panel' }));

    expect(screen.queryByRole('region', { name: 'Destination panel' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Turn-by-turn guidance')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Navigate to a place' }));
    expect(screen.getByRole('region', { name: 'Destination panel' })).toBeInTheDocument();
    expect(screen.getByLabelText('Turn-by-turn guidance')).toBeInTheDocument();
  });

  it('uses the saved place name and coordinates in the existing navigation destination flow', async () => {
    mocks.platform = 'android';
    const setDestination = vi.fn().mockResolvedValue(undefined);
    mocks.navigationState = { ...mocks.navigationState, setDestination };
    mocks.savedPlaces = [{
      id: 'home',
      kind: 'home',
      name: 'Home',
      addressLabel: 'Quezon City, Philippines',
      lat: 14.65,
      lng: 121.05,
    }];
    renderRideMap(true);

    fireEvent.click(screen.getByRole('button', { name: 'Navigate to a place' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Home' }));

    expect(setDestination).toHaveBeenCalledWith({ lat: 14.65, lng: 121.05, label: 'Home' });
  });

  it('gates turn details and destination actions on fresh GPS even while retaining the accepted location', async () => {
    mocks.platform = 'android';
    mocks.trackerHasFreshLocation = false;
    mocks.navigationState = {
      destination: { lat: 14.6, lng: 121, label: 'Destination' },
      route: { coordinates: [{ lat: 14.6, lng: 121 }, { lat: 14.7, lng: 121 }], maneuvers: [], distanceMeters: 100, durationSeconds: 60 },
      error: null,
      isGuiding: true,
      isRouting: false,
      nextInstruction: 'Turn right',
      nextStreetName: 'Highland Avenue',
      distanceToNextManeuverMeters: 120,
      supported: true,
      offlineAvailable: true,
      isDownloadingTiles: false,
      tileDownloadProgress: null,
      setDestination: vi.fn(),
      startGuidance: vi.fn(),
      stopGuidance: vi.fn(),
      clearDestination: vi.fn(),
      downloadTiles: vi.fn(),
    };
    renderRideMap(true);

    const banner = await screen.findByLabelText('Turn-by-turn guidance');
    expect(mocks.navigationFreshness).toBe(false);
    expect(banner).toHaveTextContent('Waiting for GPS');
    expect(banner).not.toHaveTextContent('Turn right');
    expect(banner).not.toHaveTextContent('120 m');

    expect(screen.getByRole('region', { name: 'Destination panel' })).toHaveAttribute('data-location-fresh', 'false');
  });
});
