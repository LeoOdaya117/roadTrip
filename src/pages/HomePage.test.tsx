import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createRide: vi.fn(),
  joinRide: vi.fn(),
  saveRideSession: vi.fn(),
  getAllSessions: vi.fn(),
  getRideSession: vi.fn(),
  setUser: vi.fn(),
  setRide: vi.fn(),
  updateRiders: vi.fn(),
  clearRide: vi.fn(),
  setSoloMode: vi.fn(),
  enterPage: vi.fn(),
}));

vi.mock('@ionic/react', () => ({
  IonContent: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  IonHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <header {...props}>{children}</header>,
  IonPage: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <main {...props}>{children}</main>,
  IonSpinner: () => <span role="progressbar" />,
  IonTitle: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  IonToolbar: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  IonButtons: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonIcon: () => null,
  IonModal: ({ isOpen, children }: React.PropsWithChildren<{ isOpen: boolean }>) => isOpen ? <div role="dialog">{children}</div> : null,
  useIonViewWillEnter: (callback: () => void) => { mocks.enterPage.mockImplementation(callback); },
}));

vi.mock('react-router-dom', () => ({ useHistory: () => ({ push: mocks.push, listen: () => () => undefined }) }));
vi.mock('../services/api', () => ({ createRide: mocks.createRide, joinRide: mocks.joinRide }));
vi.mock('../services/user', () => ({ createLocalUser: (isHost: boolean) => ({ id: isHost ? 'host-1' : 'guest-1', name: 'Test Rider', isHost }), loadUserProfile: () => ({}) }));
vi.mock('../services/offlineDb', () => ({
  getRideSession: mocks.getRideSession,
  getAllSessions: mocks.getAllSessions,
  saveRideSession: mocks.saveRideSession,
}));
vi.mock('../store/rideStore', () => ({
  useRideStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    currentUser: undefined,
    setUser: mocks.setUser,
    setRide: mocks.setRide,
    updateRiders: mocks.updateRiders,
    clearRide: mocks.clearRide,
    setSoloMode: mocks.setSoloMode,
  }),
}));
vi.mock('../components/RideSetupWizard', () => ({
  default: ({ busy, errorMessage, onContinue, onCancel }: {
    busy: boolean;
    errorMessage?: string | null;
    isModalPresented: boolean;
    onContinue: (mode: 'group' | 'solo', destination: { lat: number; lng: number; label: string }, routeIndex: number) => void;
    onCancel: () => void;
  }) => <div>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    <button onClick={() => onContinue('group', { lat: 14.1, lng: 120.9, label: 'Tagaytay' }, 0)} disabled={busy}>Create test group</button>
    <button onClick={onCancel}>Cancel setup</button>
    {busy && <span>Starting…</span>}
  </div>,
}));

import HomePage from './HomePage';

describe('HomePage actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enterPage.mockReset();
    mocks.getAllSessions.mockResolvedValue([]);
    mocks.getRideSession.mockResolvedValue(undefined);
    mocks.saveRideSession.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('queues a fresh read when ride-ended overlaps a pending page refresh', async () => {
    let resolveSessions!: (sessions: import('../types/ride').RideSession[]) => void;
    const pendingSessions = new Promise<import('../types/ride').RideSession[]>((resolve) => {
      resolveSessions = resolve;
    });
    mocks.getAllSessions.mockReturnValueOnce(pendingSessions);
    const view = render(<HomePage />);

    expect(mocks.getAllSessions).not.toHaveBeenCalled();
    act(() => mocks.enterPage());
    expect(mocks.getAllSessions).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('ride:ended')));
    expect(mocks.getAllSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSessions([{
        rideId: 'ride-ended-race',
        userId: 'rider-1',
        userName: 'Rider',
        isHost: true,
        isSolo: true,
        createdAt: '2026-10-11T00:00:00.000Z',
        status: 'active',
      }]);
      await pendingSessions;
    });
    await waitFor(() => expect(mocks.getAllSessions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.container.querySelector('.resume-card')).toBeNull());

    act(() => mocks.enterPage());
    await waitFor(() => expect(mocks.getAllSessions).toHaveBeenCalledTimes(3));
  });

  it('validates an empty ride code and lets the user focus the labeled code field', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Join Ride' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a ride code to join.');
    expect(mocks.joinRide).not.toHaveBeenCalled();

    const input = screen.getByRole('textbox', { name: 'Ride code' });
    await user.click(screen.getByRole('button', { name: 'Focus code input' }));
    expect(input).toHaveFocus();
  });

  it('shows join loading, recovers from an API error, and navigates after a successful retry', async () => {
    const user = userEvent.setup();
    let resolveJoin: ((value: { rideId: string; rider: { id: string; name: string; lat: number; lng: number; speed: null; timestamp: string } }) => void) | undefined;
    mocks.joinRide
      .mockRejectedValueOnce(new Error('Ride code not found'))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveJoin = resolve; }));
    render(<HomePage />);

    const code = screen.getByRole('textbox', { name: 'Ride code' });
    await user.type(code, 'CREW42');
    await user.click(screen.getByRole('button', { name: 'Join Ride' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ride code not found');
    expect(screen.getByRole('button', { name: 'Join Ride' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Join Ride' }));
    expect(await screen.findByText('Joining…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Joining/ })).toBeDisabled();
    resolveJoin?.({
      rideId: 'group-success',
      rider: { id: 'guest-1', name: 'Test Rider', lat: 14.6, lng: 121, speed: null, timestamp: new Date().toISOString() },
    });

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/ride-lobby/group-success'));
    expect(mocks.joinRide).toHaveBeenLastCalledWith('CREW42', expect.objectContaining({ isHost: false }));
    expect(mocks.saveRideSession).toHaveBeenCalledWith(expect.objectContaining({ rideId: 'group-success', isHost: false, status: 'active' }));
  });

  it('keeps group creation in the wizard while loading, reports failure, and navigates after retry', async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: { rideId: string; rider: { id: string; name: string; lat: number; lng: number; speed: null; timestamp: string } }) => void) | undefined;
    mocks.createRide
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    render(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Start a ride' }));
    await user.click(screen.getByRole('button', { name: 'Create test group' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create test group' }));
    expect(await screen.findByText('Starting…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create test group' })).toBeDisabled();
    resolveCreate?.({
      rideId: 'created-group',
      rider: { id: 'host-1', name: 'Test Rider', lat: 14.6, lng: 121, speed: null, timestamp: new Date().toISOString() },
    });

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/ride-lobby/created-group'));
    expect(mocks.saveRideSession).toHaveBeenCalledWith(expect.objectContaining({
      rideId: 'created-group',
      isHost: true,
      navigationDestination: { lat: 14.1, lng: 120.9, label: 'Tagaytay' },
      navigationRouteIndex: 0,
    }));
  });
});
