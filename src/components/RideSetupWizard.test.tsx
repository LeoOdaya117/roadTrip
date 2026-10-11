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
  setView: vi.fn(),
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
  useMap: () => ({ fitBounds: vi.fn(), invalidateSize: vi.fn(), setView: mocks.setView, getZoom: () => 12, whenReady: (callback: () => void) => callback(), getContainer: () => document.createElement('div') }),
  useMapEvents: (handlers: { click: (event: { latlng: { lat: number; lng: number } }) => void }) => { mocks.mapTap = handlers.click; return null; },
}));

const location = { lat: 14.6, lng: 121, speed: null, timestamp: '2026-10-08T00:00:00.000Z' };
const destination = { lat: 14.1, lng: 120.9, label: 'Tagaytay, Cavite' };
const routes: NavigationRouteOption[] = [
  { label: 'Recommended', route: { coordinates: [{ lat: 14.6, lng: 121 }, destination], maneuvers: [], distanceMeters: 45_600, durationSeconds: 5400 } },
  { label: 'Alternative 1', route: { coordinates: [{ lat: 14.6, lng: 121 }, destination], maneuvers: [], distanceMeters: 52_000, durationSeconds: 6000 } },
];

const chooseModeAndDestination = async (mode: 'Solo ride' | 'Group ride' = 'Solo ride') => {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(mode) }));
  fireEvent.click(screen.getByRole('button', { name: 'Choose destination' }));
  expect(await screen.findByRole('heading', { name: 'Choose your destination' })).toBeInTheDocument();
};

const chooseSearchResult = async () => {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search destination' }), { target: { value: 'Tagaytay' } });
  const result = await screen.findByRole('button', { name: /Tagaytay/ }, { timeout: 1500 });
  fireEvent.click(result);
  expect(screen.getByRole('heading', { name: 'Choose your destination' })).toBeInTheDocument();
  return result;
};

describe('RideSetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mapTap = null;
    mocks.setView.mockClear();
    mocks.supportsTurnByTurnNavigation.mockReturnValue(true);
    mocks.getCurrentLocationFix.mockResolvedValue(location);
    mocks.searchPlaces.mockResolvedValue([{ ...destination, attribution: 'Photon' }]);
    mocks.calculateRouteOptions.mockResolvedValue(routes);
  });

  it('uses native radio controls and delays requesting location until destination selection', async () => {
    render(<RideSetupWizard busy={false} onCancel={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /Solo ride/ })).toHaveAttribute('type', 'radio');
    expect(mocks.getCurrentLocationFix).not.toHaveBeenCalled();
    await chooseModeAndDestination();
    await waitFor(() => expect(mocks.getCurrentLocationFix).toHaveBeenCalledTimes(1));
  });

  it('requires the same Use destination action for search results and map pins', async () => {
    const onContinue = vi.fn();
    render(<RideSetupWizard busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    await chooseModeAndDestination();
    const result = await chooseSearchResult();
    expect(result).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(mocks.setView).toHaveBeenLastCalledWith([destination.lat, destination.lng], 12, { animate: false }));
    expect(mocks.calculateRouteOptions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use destination' }));
    expect(await screen.findByRole('heading', { name: 'Choose your route' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledWith(
      { lat: location.lat, lng: location.lng }, destination,
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Edit destination' }));
    await waitFor(() => expect(mocks.mapTap).toBeTypeOf('function'));
    act(() => mocks.mapTap?.({ latlng: { lat: 14.25, lng: 121.05 } }));
    expect(await screen.findByText(/Selected · Map pin · 14\.2500, 121\.0500/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use destination' }));
    expect(await screen.findByRole('heading', { name: 'Choose your route' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenLastCalledWith(
      { lat: location.lat, lng: location.lng },
      { lat: 14.25, lng: 121.05, label: 'Map pin · 14.2500, 121.0500' },
    ));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('compares Android routes, lets the rider choose one, and creates only on review confirmation', async () => {
    const onContinue = vi.fn();
    render(<RideSetupWizard busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    await chooseModeAndDestination('Group ride');
    await chooseSearchResult();
    fireEvent.click(screen.getByRole('button', { name: 'Use destination' }));
    expect(await screen.findByRole('radio', { name: /Route 2.*52\.0 km.*100 min/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Route 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review ride' }));
    expect(screen.getByRole('heading', { name: 'Review your ride' })).toBeInTheDocument();
    expect(screen.getByText('Tagaytay, Cavite')).toBeInTheDocument();
    expect(screen.getByText('52.0 km')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create group ride' }));
    expect(onContinue).toHaveBeenCalledWith('group', destination, 1);
  });

  it('uses three web stages and omits route estimates from the web review', async () => {
    mocks.supportsTurnByTurnNavigation.mockReturnValue(false);
    const onContinue = vi.fn();
    render(<RideSetupWizard busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    expect(screen.getByLabelText('Step 1 of 3')).toBeInTheDocument();
    await chooseModeAndDestination();
    expect(screen.getByLabelText('Step 2 of 3')).toBeInTheDocument();
    await chooseSearchResult();
    fireEvent.click(screen.getByRole('button', { name: 'Use destination' }));
    expect(await screen.findByRole('heading', { name: 'Review your ride' })).toBeInTheDocument();
    expect(screen.getByLabelText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByText(/Guidance is unavailable on this device/)).toBeInTheDocument();
    expect(screen.queryByText('DISTANCE')).not.toBeInTheDocument();
    expect(screen.queryByText('EST. TIME')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start solo ride' }));
    expect(onContinue).toHaveBeenCalledWith('solo', destination, 0);
    expect(mocks.calculateRouteOptions).not.toHaveBeenCalled();
  });

  it('offers Retry and Continue without guidance when route calculation fails', async () => {
    mocks.calculateRouteOptions.mockRejectedValueOnce(new Error('Routing service offline.'));
    const onContinue = vi.fn();
    render(<RideSetupWizard busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    await chooseModeAndDestination();
    await chooseSearchResult();
    fireEvent.click(screen.getByRole('button', { name: 'Use destination' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Routing service offline');
    expect(screen.getByRole('button', { name: 'Retry route search' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue without guidance' }));
    expect(await screen.findByRole('heading', { name: 'Review your ride' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start solo ride' }));
    expect(onContinue).toHaveBeenCalledWith('solo', destination, 0);
  });

  it('retries location from route comparison', async () => {
    mocks.getCurrentLocationFix
      .mockRejectedValueOnce(new Error('Location permission denied.'))
      .mockResolvedValueOnce(location);
    const onContinue = vi.fn();
    render(<RideSetupWizard busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    await chooseModeAndDestination('Group ride');
    await chooseSearchResult();
    fireEvent.click(screen.getByRole('button', { name: 'Use destination' }));
    expect(await screen.findByText(/Location permission denied/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry location' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry location' }));
    await waitFor(() => expect(mocks.getCurrentLocationFix).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.calculateRouteOptions).toHaveBeenCalledWith(
      { lat: location.lat, lng: location.lng }, destination,
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Review ride' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create group ride' }));
    expect(onContinue).toHaveBeenCalledWith('group', destination, 0);
  });

  it('allows continuing without guidance after location fails', async () => {
    mocks.getCurrentLocationFix.mockRejectedValue(new Error('Location permission denied.'));
    const onContinue = vi.fn();
    render(<RideSetupWizard busy={false} onCancel={vi.fn()} onContinue={onContinue} />);
    await chooseModeAndDestination('Group ride');
    await chooseSearchResult();
    fireEvent.click(screen.getByRole('button', { name: 'Use destination' }));
    expect(await screen.findByText(/Location permission denied/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue without guidance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create group ride' }));
    expect(onContinue).toHaveBeenCalledWith('group', destination, 0);
    expect(mocks.calculateRouteOptions).not.toHaveBeenCalled();
  });

  it('closes setup on Escape and Android back from any stage', async () => {
    const onCancel = vi.fn();
    render(<RideSetupWizard busy={false} onCancel={onCancel} onContinue={vi.fn()} />);
    await chooseModeAndDestination();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    const register = vi.fn();
    fireEvent(document, new CustomEvent('ionBackButton', { detail: { register } }));
    expect(register).toHaveBeenCalledWith(1000, expect.any(Function));
    register.mock.calls[0][1]();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('does not cancel setup while ride creation is busy', () => {
    const onCancel = vi.fn();
    render(<RideSetupWizard busy onCancel={onCancel} onContinue={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
