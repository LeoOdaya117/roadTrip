import React from 'react';
import { IonApp } from '@ionic/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RideLobbyPage from './RideLobbyPage';
import { useRideStore } from '../store/rideStore';

vi.mock('../hooks/useRideChannel', () => ({ useRideChannel: vi.fn() }));
vi.mock('@ionic/react', async (importOriginal) => {
  const ionic = await importOriginal<typeof import('@ionic/react')>();
  return {
    ...ionic,
    IonApp: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    IonToast: ({ isOpen, message }: { isOpen: boolean; message: string }) =>
      isOpen ? <div role="status">{message}</div> : null,
  };
});

const LocationOutput = () => {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}</output>;
};

const renderLobby = (path = '/ride-lobby/ride-123') =>
  render(
    <IonApp>
      <MemoryRouter initialEntries={[path]}>
        <Route path="/ride-lobby/:rideId?">
          <RideLobbyPage />
        </Route>
        <Route path="/ride-map/:rideId">
          <p>Ride map</p>
        </Route>
        <LocationOutput />
      </MemoryRouter>
    </IonApp>,
  );

describe('RideLobbyPage', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    useRideStore.setState({
      currentUser: undefined,
      rideId: undefined,
      riders: {},
      messages: [],
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  it('copies the current ride code and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderLobby();

    fireEvent.click(screen.getByRole('button', { name: /copy invite/i }));

    expect(writeText).toHaveBeenCalledWith('ride-123');
    expect(await screen.findByText('Ride code copied. Send it to your crew.')).toBeVisible();
  });

  it('gives a manual-selection fallback when clipboard access is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderLobby();

    fireEvent.click(screen.getByRole('button', { name: /copy invite/i }));

    expect(await screen.findByText('Copy was blocked. Select the ride code above to share it.')).toBeVisible();
    expect(screen.getByText('ride-123')).toBeVisible();
  });

  it('lets the host start the ride and routes to the existing map route', async () => {
    useRideStore.setState({
      currentUser: { id: 'host-1', name: 'Host', isHost: true },
    });
    renderLobby();

    const startButton = screen.getByRole('button', { name: 'Start group ride' });
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);

    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent('/ride-map/ride-123'));
  });

  it('disables the host start action when no ride code is available', () => {
    useRideStore.setState({
      currentUser: { id: 'host-1', name: 'Host', isHost: true },
    });
    renderLobby('/ride-lobby');

    expect(screen.getByRole('button', { name: 'Start group ride' })).toBeDisabled();
  });

  it('keeps a non-host in the waiting state without exposing the start action', () => {
    useRideStore.setState({
      currentUser: { id: 'rider-2', name: 'Rider', isHost: false },
    });
    renderLobby();

    expect(screen.getByText('Waiting for the host to start the ride.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start group ride' })).not.toBeInTheDocument();
  });
});
