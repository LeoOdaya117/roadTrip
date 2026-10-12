import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationDestination, NavigationRoute } from '../types/ride';
import RideMapView from './RideMapView';

const mapMock = vi.hoisted(() => ({ handlers: null as null | { click?: (event: unknown) => void } }));

vi.mock('react-leaflet', () => ({
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    useMap: () => ({ invalidateSize: vi.fn() }),
    useMapEvents: (handlers: typeof mapMock.handlers) => { mapMock.handlers = handlers; },
    Polyline: ({ positions, pathOptions }: { positions: Array<[number, number]>; pathOptions?: { color?: string } }) => (
      <div data-testid="navigation-route" data-positions={JSON.stringify(positions)} data-color={pathOptions?.color} />
    ),
    CircleMarker: ({ center }: { center: [number, number] }) => (
      <div data-testid="destination-marker" data-center={JSON.stringify(center)} />
    ),
  }));

describe('RideMapView navigation overlays', () => {
  beforeEach(() => { mapMock.handlers = null; });

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
});
