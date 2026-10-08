import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationRouteOption } from '../types/ride';
import RideSetupWizard from './RideSetupWizard';

const mocks = vi.hoisted(() => ({
  calculateRouteOptions: vi.fn(),
  getCurrentLocationFix: vi.fn(),
  searchPlaces: vi.fn(),
  supportsTurnByTurnNavigation: vi.fn(),
  mapTap: null as null | ((event: { latlng: { lat: number; lng: number } }) => void),
}));

vi.mock('../services/navigationEngine', () => ({
  calculateRouteOptions: mocks.calculateRouteOptions,
  supportsTurnByTurnNavigation: mocks.supportsTurnByTurnNavigation,
}));
vi.mock('../services/currentLocation', () => ({ getCurrentLocationFix: mocks.getCurrentLocationFix }));
vi.mock('../services/placeSearch', () => ({
  PLACE_SEARCH_ATTRIBUTION: 'Photon attribution',
  searchPlaces: mocks.searchPlaces,
}));
vi.mock('@ionic/react', () => ({ IonSpinner: () => <span aria-label="Loading" /> }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: vi.fn() }),
  useMapEvents: (handlers: { click: (event: { latlng: { lat: number; lng: number } }) => void }) => { mocks.mapTap = handlers.click; return null; },
}));

const location = { lat: 14.6, lng: 121, speed: null, timestamp: '2026-10-08T00:00:00.000Z' };
const destination = { lat: 14.1, lng: 120.9, label: 'Tagaytay, Cavite' };
const routes: NavigationRouteOption[] = [
  { label: 'Recommended', route: { coordinates: [{ lat: 14.6, lng: 121 }, destination], maneuvers: [], distanceMeters: 45_600, durationSeconds: 5400 } },
  { label: 'Alternative 1', route: { coordinates: [{ lat: 14.6, lng: 121 }, destination], maneuvers: [], distanceMeters: 52_000, durationSeconds: 6000 } },
];

describe('RideSetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mapTap = null;
    mocks.supportsTurnByTurnNavigation.mockReturnValue(true);
    mocks.getCurrentLocationFix.mockResolvedValue(location);
    mocks.searchPlaces.mockResolvedValue([{ ...destination, attribution: 'Photon' }]);
    mocks.calculateRouteOptions.mockResolvedValue(routes);
  });

  it('searches, previews available routes, lets the rider choose one, then continues', async () => {
    const onContinue = vi.fn();
    render(<RideSetupWizard mode="solo" busy={false} onCancel={vi.fn()} onContinue={onContinue} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Destination' }), { target: { value: 'Tagaytay' } });
    const result = await screen.findByRole('option', { name: /Tagaytay/ }, { timeout: 1500 });
    fireEvent.click(result);

    expect(await screen.findByRole('heading', { name: 'Choose your route' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /Route 2.*52.0 km.*100 min/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Route 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start solo ride' }));

    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledWith(
      { lat: location.lat, lng: location.lng }, destination,
    ));
    expect(onContinue).toHaveBeenCalledWith(destination, 1);
  });

  it('shows location failure and lets the rider save a destination without route preview', async () => {
    mocks.getCurrentLocationFix.mockRejectedValue(new Error('Location permission denied.'));
    const onContinue = vi.fn();
    render(<RideSetupWizard mode="group" busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Destination' }), { target: { value: 'Tagaytay' } });
    fireEvent.click(await screen.findByRole('option', { name: /Tagaytay/ }, { timeout: 1500 }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Location permission denied');
    fireEvent.click(screen.getByRole('button', { name: 'Create without route preview' }));
    expect(onContinue).toHaveBeenCalledWith(destination, 0);
    expect(mocks.calculateRouteOptions).not.toHaveBeenCalled();
  });

  it('explains routing is unavailable outside Android and preserves destination setup', async () => {
    mocks.supportsTurnByTurnNavigation.mockReturnValue(false);
    const onContinue = vi.fn();
    render(<RideSetupWizard mode="solo" busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Destination' }), { target: { value: 'Tagaytay' } });
    fireEvent.click(await screen.findByRole('option', { name: /Tagaytay/ }, { timeout: 1500 }));

    expect(await screen.findByText(/available in the Android app/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start without route preview' }));
    expect(onContinue).toHaveBeenCalledWith(destination, 0);
    expect(mocks.calculateRouteOptions).not.toHaveBeenCalled();
  });

  it('accepts a tapped map pin as the destination', async () => {
    const onContinue = vi.fn();
    render(<RideSetupWizard mode="solo" busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    await waitFor(() => expect(mocks.mapTap).toBeTypeOf('function'));
    act(() => mocks.mapTap?.({ latlng: { lat: 14.25, lng: 121.05 } }));

    expect(await screen.findByRole('heading', { name: 'Choose your route' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledWith(
      { lat: location.lat, lng: location.lng },
      { lat: 14.25, lng: 121.05, label: 'Map pin · 14.2500, 121.0500' },
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Start solo ride' }));
    expect(onContinue).toHaveBeenCalledWith({ lat: 14.25, lng: 121.05, label: 'Map pin · 14.2500, 121.0500' }, 0);
  });
});
