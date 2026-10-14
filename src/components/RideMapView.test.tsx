import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationDestination, NavigationRoute } from '../types/ride';
import RideMapView from './RideMapView';

const mapMock = vi.hoisted(() => ({
  handlers: {} as { click?: (event: unknown) => void; dragstart?: (event: unknown) => void },
  isWithinInset: true,
  isReady: true,
  map: {
    invalidateSize: vi.fn(),
    getSize: vi.fn(),
    getBounds: vi.fn(),
    panInside: vi.fn(),
    setView: vi.fn(),
    getZoom: vi.fn(),
    setZoom: vi.fn(),
    panTo: vi.fn(),
  },
}));

vi.mock('react-leaflet', () => ({
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{mapMock.isReady ? children : null}</div>,
    TileLayer: () => null,
    useMap: () => mapMock.map,
    useMapEvents: (handlers: typeof mapMock.handlers) => { mapMock.handlers = { ...mapMock.handlers, ...handlers }; },
    Polyline: ({ positions, pathOptions }: { positions: Array<[number, number]>; pathOptions?: { color?: string } }) => (
      <div data-testid="navigation-route" data-positions={JSON.stringify(positions)} data-color={pathOptions?.color} />
    ),
    CircleMarker: ({ center }: { center: [number, number] }) => (
      <div data-testid="destination-marker" data-center={JSON.stringify(center)} />
    ),
  }));

describe('RideMapView navigation overlays', () => {
  beforeEach(() => {
    mapMock.handlers = {};
    mapMock.isWithinInset = true;
    mapMock.isReady = true;
    mapMock.map.invalidateSize.mockReset();
    mapMock.map.getSize.mockReset();
    mapMock.map.getSize.mockReturnValue({ x: 1000, y: 800 });
    mapMock.map.getBounds.mockReset();
    mapMock.map.getBounds.mockReturnValue({
      pad: () => ({ contains: () => mapMock.isWithinInset }),
    });
    mapMock.map.panInside.mockReset();
    mapMock.map.panInside.mockImplementation(() => {
      mapMock.isWithinInset = true;
    });
    mapMock.map.setView.mockReset();
    mapMock.map.getZoom.mockReset();
    mapMock.map.getZoom.mockReturnValue(18);
    mapMock.map.setZoom.mockReset();
    mapMock.map.panTo.mockReset();
  });

  const navigationRoute: NavigationRoute = {
    coordinates: [{ lat: 14.6, lng: 121 }, { lat: 14.61, lng: 121.01 }],
    maneuvers: [],
    distanceMeters: 1000,
    durationSeconds: 120,
  };
  const destination: NavigationDestination = { lat: 14.61, lng: 121.01, label: 'Destination' };

  it('centers only once when StrictMode replays mount effects', () => {
    render(
      <React.StrictMode>
        <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={{ lat: 14.6, lng: 121 }} resetKey="solo-strict" />
      </React.StrictMode>,
    );
    expect(mapMock.map.setView).toHaveBeenCalledOnce();
  });

  it('centers a delayed first fix once and preserves zoom and later manual pans', () => {
    const { rerender } = render(
      <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={null} resetKey="solo-first" />,
    );
    expect(mapMock.map.setView).not.toHaveBeenCalled();

    rerender(
      <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={{ lat: 14.6, lng: 121 }} resetKey="solo-first" />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledWith([14.6, 121], 18, { animate: false });
    mapMock.handlers.dragstart?.({});
    rerender(
      <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={{ lat: 14.61, lng: 121.01 }} resetKey="solo-first" />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledOnce();
    expect(mapMock.map.setZoom).not.toHaveBeenCalled();
    expect(mapMock.map.panInside).not.toHaveBeenCalled();
  });

  it('centers when the map becomes ready after the first fix is available', () => {
    mapMock.isReady = false;
    const props = {
      center: { lat: 0, lng: 0 },
      riders: [],
      initialLocation: { lat: 14.6, lng: 121 },
      resetKey: 'solo-ready',
    };
    const { rerender } = render(<RideMapView {...props} />);
    expect(mapMock.map.setView).not.toHaveBeenCalled();
    mapMock.isReady = true;
    rerender(<RideMapView {...props} />);
    expect(mapMock.map.setView).toHaveBeenCalledOnce();
    expect(mapMock.map.setView).toHaveBeenCalledWith([14.6, 121], 18, { animate: false });
  });

  it('waits for the next ride first fix and resets its centering once per ride', () => {
    const { rerender } = render(
      <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={{ lat: 14.6, lng: 121 }} resetKey="solo-first" />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledOnce();
    rerender(
      <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={null} resetKey="solo-second" />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledOnce();
    mapMock.map.getZoom.mockReturnValue(12);
    rerender(
      <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={{ lat: 14.7, lng: 121.1 }} resetKey="solo-second" />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledTimes(2);
    expect(mapMock.map.setView).toHaveBeenLastCalledWith([14.7, 121.1], 12, { animate: false });
    rerender(
      <RideMapView center={{ lat: 0, lng: 0 }} riders={[]} initialLocation={{ lat: 14.71, lng: 121.11 }} resetKey="solo-second" />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledTimes(2);
  });

  it('renders navigation geometry and destination at the Leaflet coordinate boundary', () => {
    render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        navigationRoute={navigationRoute}
        navigationDestination={destination}
      />,
    );
    expect(screen.getAllByTestId('navigation-route')[0]).toHaveAttribute(
      'data-positions',
      JSON.stringify([[14.6, 121], [14.61, 121.01]]),
    );
    expect(screen.getByTestId('destination-marker')).toHaveAttribute(
      'data-center',
      JSON.stringify([14.61, 121.01]),
    );
  });

  it('hides recorded track polylines while a route is visible and restores them when the route is removed', () => {
    const trackPoints = [
      { lat: 14.59, lng: 120.99 },
      { lat: 14.6, lng: 121 },
    ];
    const { rerender } = render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        trackPoints={trackPoints}
        navigationRoute={navigationRoute}
        navigationDestination={destination}
      />,
    );

    expect(screen.getAllByTestId('navigation-route')).toHaveLength(2);
    expect(screen.getAllByTestId('navigation-route').map((line) => line.getAttribute('data-color'))).toEqual([
      '#FFFFFF',
      '#168AAD',
    ]);
    expect(screen.getByTestId('destination-marker')).toBeInTheDocument();

    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        trackPoints={trackPoints}
        navigationDestination={destination}
      />,
    );

    expect(screen.getAllByTestId('navigation-route')).toHaveLength(2);
    expect(screen.getAllByTestId('navigation-route').map((line) => line.getAttribute('data-color'))).toEqual([
      'rgba(0,0,0,0.14)',
      '#285E7A',
    ]);
    expect(screen.getByTestId('destination-marker')).toBeInTheDocument();
  });

  it('keeps route and destination visible when the recorded-track overlay is disabled', () => {
    const trackPoints = [
      { lat: 14.59, lng: 120.99 },
      { lat: 14.6, lng: 121 },
    ];
    const { rerender } = render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        trackPoints={trackPoints}
        showTrack={false}
        navigationRoute={navigationRoute}
        navigationDestination={destination}
      />,
    );

    expect(screen.getAllByTestId('navigation-route')).toHaveLength(2);
    expect(screen.getByTestId('destination-marker')).toBeInTheDocument();

    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        trackPoints={trackPoints}
        showTrack={false}
        navigationDestination={destination}
      />,
    );
    expect(screen.queryAllByTestId('navigation-route')).toHaveLength(0);
    expect(screen.getByTestId('destination-marker')).toBeInTheDocument();
  });

  it('forwards map taps as latitude/longitude when destination picking is enabled', () => {
    const onDestinationPick = vi.fn();
    render(
      <RideMapView center={{ lat: 14.6, lng: 121 }} riders={[]} onDestinationPick={onDestinationPick} />,
    );
    fireEvent.click(screen.getByTestId('map'));
    mapMock.handlers?.click?.({ latlng: { lat: 14.7, lng: 121.2 } });
    expect(onDestinationPick).toHaveBeenCalledWith({ lat: 14.7, lng: 121.2 });
  });

  it('centers exactly on the owner point while preserving zoom', () => {
    mapMock.isWithinInset = false;

    render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followEnabled
        followLocation={{ lat: 14.62, lng: 121.03 }}
      />,
    );

    expect(mapMock.map.setView).toHaveBeenCalledWith([14.62, 121.03], 18, { animate: false });
    expect(mapMock.map.setZoom).not.toHaveBeenCalled();
    expect(mapMock.map.panTo).not.toHaveBeenCalled();
  });

  it('does nothing when follow is disabled or has no location', () => {
    const { rerender } = render(
      <RideMapView center={{ lat: 14.6, lng: 121 }} riders={[]} />,
    );

    rerender(
      <RideMapView center={{ lat: 14.6, lng: 121 }} riders={[]} followLocation={null} />,
    );

    expect(mapMock.map.panInside).not.toHaveBeenCalled();
    expect(mapMock.map.getBounds).not.toHaveBeenCalled();
  });

  it('centers on enabling follow with an unchanged in-bounds coordinate and on every changed fix', () => {
    const { rerender } = render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followEnabled={false}
        followLocation={{ lat: 14.6, lng: 121 }}
      />,
    );
    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followEnabled
        followLocation={{ lat: 14.6, lng: 121 }}
      />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledWith([14.6, 121], 18, { animate: false });

    mapMock.isWithinInset = false;
    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followEnabled
        followLocation={{ lat: 14.61, lng: 121.01 }}
      />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledWith([14.61, 121.01], 18, { animate: false });

    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followEnabled
        followLocation={{ lat: 14.611, lng: 121.011 }}
      />,
    );
    expect(mapMock.map.setView).toHaveBeenCalledTimes(3);
    expect(mapMock.map.setView).toHaveBeenLastCalledWith([14.611, 121.011], 18, { animate: false });
    rerender(<RideMapView center={{ lat: 14.6, lng: 121 }} riders={[]} followEnabled={false} followLocation={{ lat: 14.611, lng: 121.011 }} />);
    rerender(<RideMapView center={{ lat: 14.6, lng: 121 }} riders={[]} followEnabled followLocation={{ lat: 14.611, lng: 121.011 }} />);
    expect(mapMock.map.setView).toHaveBeenCalledTimes(4);
  });

  it('only disengages enabled follow on drag and continues forwarding map taps', () => {
    const onFollowInterrupted = vi.fn();
    const onDestinationPick = vi.fn();
    const view = render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followEnabled={false}
        followLocation={{ lat: 14.6, lng: 121 }}
        onFollowInterrupted={onFollowInterrupted}
        onDestinationPick={onDestinationPick}
      />,
    );

    mapMock.handlers.dragstart?.({});
    expect(onFollowInterrupted).not.toHaveBeenCalled();
    mapMock.handlers.click?.({ latlng: { lat: 14.7, lng: 121.2 } });

    view.rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followEnabled
        followLocation={{ lat: 14.6, lng: 121 }}
        onFollowInterrupted={onFollowInterrupted}
        onDestinationPick={onDestinationPick}
      />,
    );
    mapMock.handlers.dragstart?.({});

    expect(onFollowInterrupted).toHaveBeenCalledOnce();
    expect(onDestinationPick).toHaveBeenCalledWith({ lat: 14.7, lng: 121.2 });
  });
});
