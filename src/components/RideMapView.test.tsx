import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationDestination, NavigationRoute } from '../types/ride';
import RideMapView from './RideMapView';

const mapMock = vi.hoisted(() => ({
  handlers: {} as { click?: (event: unknown) => void; dragstart?: (event: unknown) => void },
  isWithinInset: true,
  map: {
    invalidateSize: vi.fn(),
    getSize: vi.fn(),
    getBounds: vi.fn(),
    panInside: vi.fn(),
    setView: vi.fn(),
    setZoom: vi.fn(),
    panTo: vi.fn(),
  },
}));

vi.mock('react-leaflet', () => ({
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
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

  it('pans to the owner point outside the inset bounds without animation or zoom changes', () => {
    mapMock.isWithinInset = false;

    render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followLocation={{ lat: 14.62, lng: 121.03 }}
      />,
    );

    expect(mapMock.map.panInside).toHaveBeenCalledWith([14.62, 121.03], {
      paddingTopLeft: [200, 160],
      paddingBottomRight: [200, 160],
      animate: false,
    });
    expect(mapMock.map.setView).not.toHaveBeenCalled();
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

  it('avoids camera calls for unchanged and in-bounds updates, then pans once when the point leaves the inset', () => {
    const { rerender } = render(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followLocation={{ lat: 14.6, lng: 121 }}
      />,
    );
    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followLocation={{ lat: 14.6, lng: 121 }}
      />,
    );
    expect(mapMock.map.panInside).not.toHaveBeenCalled();

    mapMock.isWithinInset = false;
    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followLocation={{ lat: 14.61, lng: 121.01 }}
      />,
    );
    expect(mapMock.map.panInside).toHaveBeenCalledOnce();

    rerender(
      <RideMapView
        center={{ lat: 14.6, lng: 121 }}
        riders={[]}
        followLocation={{ lat: 14.611, lng: 121.011 }}
      />,
    );
    expect(mapMock.map.panInside).toHaveBeenCalledOnce();
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
