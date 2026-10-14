import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LocationPermissionSetup from './LocationPermissionSetup';

const mocks = vi.hoisted(() => ({ supported: true, saved: null as string | null, prepare: vi.fn(), save: vi.fn() }));
vi.mock('../services/locationPermissions', () => ({
  isAndroidPermissionSetupSupported: () => mocks.supported,
  hasFinishedLocationPermissionSetup: () => mocks.saved === 'completed' || mocks.saved === 'skipped',
  prepareLocationPermissions: mocks.prepare,
  saveLocationPermissionSetup: mocks.save,
  LocationServicesDisabledError: class extends Error {},
  PERMISSION_SETUP_REQUEST_EVENT: 'roadtrip:permission-setup-request',
}));
import { LocationServicesDisabledError } from '../services/locationPermissions';

describe('LocationPermissionSetup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.supported = true;
    mocks.saved = null;
    mocks.prepare.mockResolvedValue(undefined);
    mocks.save.mockImplementation((value: string) => { mocks.saved = value; });
  });
  const mount = () => render(<LocationPermissionSetup><div>Ride route mounted</div></LocationPermissionSetup>);

  it('automatically requests Android permissions and gates first-launch routes', async () => {
    mount();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(screen.queryByText('Ride route mounted')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for Android permissions');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await screen.findByText('Ride route mounted');
    expect(mocks.save).toHaveBeenCalledWith('completed');
  });

  it('does not duplicate first-launch requests under StrictMode or rerenders', async () => {
    const view = render(<StrictMode><LocationPermissionSetup><div>Ride route mounted</div></LocationPermissionSetup></StrictMode>);
    await screen.findByText('Ride route mounted');
    view.rerender(<StrictMode><LocationPermissionSetup><div>Ride route mounted</div></LocationPermissionSetup></StrictMode>);
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it('shows denial recovery and allows an explicit retry without releasing routes', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('Allow notifications in Settings.'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow notifications');
    expect(screen.queryByText('Ride route mounted')).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await screen.findByText('Ride route mounted');
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });

  it('offers Turn on location recovery when Android location settings were cancelled', async () => {
    mocks.prepare.mockRejectedValueOnce(new LocationServicesDisabledError());
    mount();
    const retry = await screen.findByRole('button', { name: 'Turn on location' });
    fireEvent.click(retry);
    await screen.findByText('Ride route mounted');
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });

  it('explicit skip after denial releases routes and remembers the later launch', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('Location denied'));
    const view = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(mocks.save).toHaveBeenCalledWith('skipped');
    expect(screen.getByText('Ride route mounted')).toBeInTheDocument();
    view.unmount();
    mount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it('passes through web and completed launches without native prompts', () => {
    mocks.supported = false;
    const view = mount();
    expect(screen.getByText('Ride route mounted')).toBeInTheDocument();
    expect(mocks.prepare).not.toHaveBeenCalled();
    view.unmount();
    mocks.supported = true;
    mocks.saved = 'completed';
    mount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('cannot dismiss while requesting and cleans up an outstanding request on unmount', async () => {
    let resolve: (() => void) | undefined;
    mocks.prepare.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    const view = mount();
    fireEvent.click(document.querySelector('.custom-sheet-backdrop')!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.unmount();
    await act(async () => resolve?.());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('automatically requests on Account reopen and cleans up the listener', async () => {
    mocks.saved = 'completed';
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = mount();
    act(() => {
      window.dispatchEvent(new Event('roadtrip:permission-setup-request'));
      window.dispatchEvent(new Event('roadtrip:permission-setup-request'));
    });
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(screen.getByText('Ride route mounted')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();
    expect(remove).toHaveBeenCalledWith('roadtrip:permission-setup-request', expect.any(Function));
  });
});
