import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlaceSearchResult } from '../../services/placeSearch';
import type { NavigationDestination, NavigationRoute } from '../../types/ride';
import NavigationPanel from './NavigationPanel';

vi.mock('@ionic/react', () => ({
  IonButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  IonIcon: () => <span aria-hidden="true" />,
}));

const place: PlaceSearchResult = {
  label: 'Tagaytay, Cavite, Philippines',
  lat: 14.1,
  lng: 120.9,
  attribution: 'Photon',
};

const destination: NavigationDestination = { lat: place.lat, lng: place.lng, label: place.label };
const route: NavigationRoute = {
  coordinates: [{ lat: 14, lng: 121 }, { lat: place.lat, lng: place.lng }],
  maneuvers: [],
  distanceMeters: 45_600,
  durationSeconds: 5_400,
};

const renderPanel = (overrides: Partial<React.ComponentProps<typeof NavigationPanel>> = {}) => {
  const props: React.ComponentProps<typeof NavigationPanel> = {
    query: '',
    onQueryChange: vi.fn(),
    placeResults: [],
    isSearchingPlaces: false,
    isDebouncingPlaces: false,
    placeSearchError: null,
    onSelectPlace: vi.fn(),
    isPickingDestination: false,
    onTogglePicking: vi.fn(),
    onClose: vi.fn(),
    destination: null,
    route: null,
    isGuiding: false,
    isRouting: false,
    navigationError: null,
    supported: true,
    hasLocation: true,
    onToggleGuidance: vi.fn(),
    onClearDestination: vi.fn(),
    offlineAvailable: true,
    isDownloadingTiles: false,
    tileDownloadProgress: null,
    onDownloadTiles: vi.fn(),
    ...overrides,
  };
  return { ...render(<NavigationPanel {...props} />), props };
};

describe('NavigationPanel', () => {
  it('shows location search results and forwards the selected destination', () => {
    const onSelectPlace = vi.fn();
    renderPanel({ query: 'Tagaytay', placeResults: [place], onSelectPlace });

    fireEvent.click(screen.getByRole('option', { name: /Tagaytay/ }));

    expect(onSelectPlace).toHaveBeenCalledWith(place);
  });

  it('shows searching, no-results, and search-error states', () => {
    const { rerender } = renderPanel({ query: 'Manila', isSearchingPlaces: true });
    expect(screen.getByRole('status')).toHaveTextContent('Searching places');

    rerender(<NavigationPanel {...renderPanelProps({ query: 'Manila', isDebouncingPlaces: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Searching places');

    rerender(<NavigationPanel {...renderPanelProps({ query: 'Manila' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('No places found');

    rerender(<NavigationPanel {...renderPanelProps({ query: 'Manila', placeSearchError: 'Search is unavailable.' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Search is unavailable.');
  });

  it('previews the route and keeps guidance unavailable until route and location are ready', () => {
    renderPanel({
      destination,
      route,
      hasLocation: false,
    });

    expect(screen.getByText('45.6 km')).toBeInTheDocument();
    expect(screen.getByText('90 min')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your location');
    expect(screen.getByRole('button', { name: 'Start ride' })).toBeDisabled();
  });

  it('shows routing and platform-unavailable guidance states', () => {
    const { rerender } = renderPanel({ destination, isRouting: true, supported: false });
    expect(screen.getByText('Calculating route…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start ride' })).toBeDisabled();

    rerender(<NavigationPanel {...renderPanelProps({ destination, supported: false })} />);
    expect(screen.getByText('Turn-by-turn navigation is unavailable on this device.')).toBeInTheDocument();
  });

  it('keeps Stop guidance enabled when GPS is stale and a route update is pending', () => {
    const onToggleGuidance = vi.fn();
    renderPanel({
      destination,
      route: null,
      isGuiding: true,
      isRouting: true,
      hasLocation: false,
      onToggleGuidance,
    });

    const stopButton = screen.getByRole('button', { name: 'Stop guidance' });
    expect(stopButton).toBeEnabled();

    fireEvent.click(stopButton);

    expect(onToggleGuidance).toHaveBeenCalledOnce();
  });

  it('lets the rider switch from search to selecting a map pin', () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    expect(props.onTogglePicking).toHaveBeenCalledOnce();
  });

  it('exposes map-pin picking and route actions', () => {
    const { props } = renderPanel({
      destination,
      route,
      supported: true,
      isGuiding: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Stop guidance' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit destination' }));
    expect(props.onToggleGuidance).toHaveBeenCalledOnce();
    expect(props.onClearDestination).toHaveBeenCalledOnce();

    const searchPanel = renderPanel({ isPickingDestination: true });
    expect(screen.getByText('Tap anywhere on the map to set your destination.')).toBeInTheDocument();
    expect(searchPanel.props.onTogglePicking).not.toHaveBeenCalled();
  });
});

const renderPanelProps = (overrides: Partial<React.ComponentProps<typeof NavigationPanel>> = {}) => ({
  query: '',
  onQueryChange: vi.fn(),
  placeResults: [],
  isSearchingPlaces: false,
  isDebouncingPlaces: false,
  placeSearchError: null,
  onSelectPlace: vi.fn(),
  isPickingDestination: false,
  onTogglePicking: vi.fn(),
  onClose: vi.fn(),
  destination: null,
  route: null,
  isGuiding: false,
  isRouting: false,
  navigationError: null,
  supported: true,
  hasLocation: true,
  onToggleGuidance: vi.fn(),
  onClearDestination: vi.fn(),
  offlineAvailable: true,
  isDownloadingTiles: false,
  tileDownloadProgress: null,
  onDownloadTiles: vi.fn(),
  ...overrides,
});
