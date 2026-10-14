import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountPage from './AccountPage';
import ThemeProvider from '../context/ThemeProvider';

const mocks = vi.hoisted(() => ({
  currentUser: { id: 'rider-1', name: 'Rider One', isHost: true, avatarUrl: undefined as string | undefined },
  updateCurrentUser: vi.fn(),
  loadUserProfile: vi.fn(),
  saveUserProfile: vi.fn(),
  searchPlaces: vi.fn(),
  enterAccount: vi.fn(),
  nativePermissions: false,
  requestPermissionSetup: vi.fn(),
  savedPlacesState: {
    savedPlaces: [] as Array<{ id: string; kind: 'home' | 'work' | 'custom'; name: string; addressLabel: string; lat: number; lng: number }> ,
    isLoading: false,
    loadError: null as string | null,
    refresh: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@ionic/react', () => ({
  IonContent: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
  IonHeader: ({ children }: React.PropsWithChildren) => <header>{children}</header>,
  IonPage: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonTitle: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  IonToolbar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonButtons: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonBackButton: () => <button type="button">Back</button>,
  IonToast: ({ isOpen, message }: { isOpen: boolean; message: string }) => isOpen ? <div role="status">{message}</div> : null,
  IonIcon: () => null,
  useIonViewWillEnter: (callback: () => void) => { mocks.enterAccount.mockImplementation(callback); },
}));

vi.mock('../store/rideStore', () => ({
  useRideStore: (selector: (state: { currentUser: typeof mocks.currentUser; updateCurrentUser: typeof mocks.updateCurrentUser }) => unknown) => selector({
    currentUser: mocks.currentUser,
    updateCurrentUser: mocks.updateCurrentUser,
  }),
}));

vi.mock('../services/user', () => ({
  loadUserProfile: mocks.loadUserProfile,
  saveUserProfile: mocks.saveUserProfile,
}));

vi.mock('../services/placeSearch', () => ({
  PLACE_SEARCH_ATTRIBUTION: 'Geocoding by Photon · © OpenStreetMap contributors',
  searchPlaces: mocks.searchPlaces,
}));

vi.mock('../hooks/useSavedPlaces', () => ({
  useSavedPlaces: () => mocks.savedPlacesState,
}));

const renderAccount = () => render(<ThemeProvider><AccountPage /></ThemeProvider>);

vi.mock('../services/locationPermissions', () => ({
  isAndroidPermissionSetupSupported: () => mocks.nativePermissions,
  requestLocationPermissionSetup: mocks.requestPermissionSetup,
}));

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nativePermissions = false;
    localStorage.clear();
    mocks.currentUser.name = 'Rider One';
    mocks.currentUser.avatarUrl = undefined;
    mocks.loadUserProfile.mockReturnValue({ name: 'Rider One', avatarUrl: 'data:image/jpeg;base64,old-avatar' });
    mocks.saveUserProfile.mockReturnValue(true);
    mocks.searchPlaces.mockResolvedValue([{
      label: 'Tagaytay, Cavite, Philippines',
      lat: 14.1,
      lng: 120.9,
      attribution: 'Photon',
    }]);
    mocks.savedPlacesState.savedPlaces = [];
    mocks.savedPlacesState.isLoading = false;
    mocks.savedPlacesState.loadError = null;
    mocks.savedPlacesState.refresh.mockReset();
    mocks.savedPlacesState.save.mockReset().mockImplementation(async (input) => ({
      id: input.id ?? input.kind,
      kind: input.kind,
      name: input.kind === 'custom' ? input.name ?? 'Custom place' : input.kind === 'home' ? 'Home' : 'Work',
      addressLabel: input.addressLabel,
      lat: input.lat,
      lng: input.lng,
    }));
    mocks.savedPlacesState.remove.mockReset().mockResolvedValue(undefined);
  });

  it('offers Android permission recovery from Account', () => {
    mocks.nativePermissions = true;
    renderAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Set up ride permissions' }));
    expect(mocks.requestPermissionSetup).toHaveBeenCalledOnce();
  });

  it('omits native permission setup in the browser', () => {
    renderAccount();
    expect(screen.queryByRole('button', { name: 'Set up ride permissions' })).not.toBeInTheDocument();
  });

  it('uploads and removes an avatar, clearing a stale saved notice after either edit', async () => {
    const OriginalFileReader = globalThis.FileReader;
    const OriginalImage = globalThis.Image;
    class TestFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        this.result = 'data:image/jpeg;base64,new-avatar';
        this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
      }
    }
    class TestImage {
      width = 100;
      height = 100;
      onload: (() => void) | null = null;
      onerror: ((event: string | Event) => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('FileReader', TestFileReader);
    vi.stubGlobal('Image', TestImage);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,resized-avatar');

    try {
      renderAccount();
      fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Profile saved');

      const file = new File(['photo'], 'avatar.jpg', { type: 'image/jpeg' });
      fireEvent.change(screen.getByLabelText('Choose a profile photo'), { target: { files: [file] } });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByAltText('Profile')).toHaveAttribute('src', 'data:image/jpeg;base64,resized-avatar'));
      expect(drawImage).toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Profile saved');
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByAltText('Profile')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
      await waitFor(() => expect(mocks.saveUserProfile).toHaveBeenLastCalledWith({ name: 'Rider One', avatarUrl: '' }));
      expect(mocks.updateCurrentUser).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Rider One', avatarUrl: undefined }));
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.stubGlobal('FileReader', OriginalFileReader);
      vi.stubGlobal('Image', OriginalImage);
    }
  });

  it('requires a display name and reports profile persistence failures inline', async () => {
    renderAccount();
    const nameInput = screen.getByRole('textbox', { name: 'Display name' });
    const saveButton = screen.getByRole('button', { name: 'Save Profile' });
    await waitFor(() => expect(nameInput).toHaveValue('Rider One'));
    fireEvent.change(nameInput, { target: { value: '' } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: '   ' } });
    expect(saveButton).toBeDisabled();
    expect(mocks.saveUserProfile).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: 'A rider' } });
    mocks.saveUserProfile.mockReturnValue(false);
    fireEvent.click(saveButton);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save profile');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mocks.updateCurrentUser).not.toHaveBeenCalled();
    expect(mocks.saveUserProfile).toHaveBeenCalledWith({ name: 'A rider', avatarUrl: 'data:image/jpeg;base64,old-avatar' });
  });

  it('selects and persists System, Light, and Dark appearance preferences', async () => {
    renderAccount();
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(localStorage.getItem('roadtrip:theme-preference')).toBe('light'));
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(localStorage.getItem('roadtrip:theme-preference')).toBe('dark'));
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    await waitFor(() => expect(localStorage.getItem('roadtrip:theme-preference')).toBe('system'));
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.saveUserProfile).not.toHaveBeenCalled();
  });

  it('refreshes saved places whenever the cached Account view enters', () => {
    renderAccount();

    mocks.enterAccount();

    expect(mocks.savedPlacesState.refresh).toHaveBeenCalledOnce();
  });

  it('shows an empty state for device-local saved places', () => {
    renderAccount();

    expect(screen.getByRole('heading', { name: 'Saved places' })).toBeInTheDocument();
    expect(screen.getByText('No saved places yet. Add a place below to use it in ride setup and navigation.')).toBeInTheDocument();
  });

  it('shows saved-place load errors and offers a retry', () => {
    mocks.savedPlacesState.loadError = 'Saved places could not be loaded.';
    renderAccount();

    expect(screen.getByRole('alert')).toHaveTextContent('Saved places could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mocks.savedPlacesState.refresh).toHaveBeenCalledOnce();
  });

  it('adds a custom place from a selected Photon result', async () => {
    renderAccount();
    fireEvent.change(screen.getByLabelText('Shortcut type'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Place name'), { target: { value: 'Weekend cabin' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for a location' }), { target: { value: 'Tagaytay' } });
    fireEvent.click(await screen.findByRole('option', { name: /Tagaytay, Cavite/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Save custom place' }));

    await waitFor(() => expect(mocks.savedPlacesState.save).toHaveBeenCalledWith({
      kind: 'custom',
      name: 'Weekend cabin',
      addressLabel: 'Tagaytay, Cavite, Philippines',
      lat: 14.1,
      lng: 120.9,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved Weekend cabin');
  });

  it('reports saved-place persistence failures inline', async () => {
    mocks.savedPlacesState.save.mockRejectedValueOnce(new Error('Local storage is unavailable.'));
    renderAccount();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for a location' }), { target: { value: 'Tagaytay' } });
    fireEvent.click(await screen.findByRole('option', { name: /Tagaytay, Cavite/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Home' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Local storage is unavailable.');
  });

  it('edits a custom name and replaces its location with another search result', async () => {
    mocks.savedPlacesState.savedPlaces = [{
      id: 'custom-1',
      kind: 'custom',
      name: 'Old cabin',
      addressLabel: 'Old road, Tagaytay',
      lat: 14.2,
      lng: 120.8,
    }];
    renderAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Old cabin' }));
    fireEvent.change(screen.getByLabelText('Place name'), { target: { value: 'Family cabin' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for a location' }), { target: { value: 'Tagaytay' } });
    fireEvent.click(await screen.findByRole('option', { name: /Tagaytay, Cavite/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.savedPlacesState.save).toHaveBeenCalledWith({
      id: 'custom-1',
      kind: 'custom',
      name: 'Family cabin',
      addressLabel: 'Tagaytay, Cavite, Philippines',
      lat: 14.1,
      lng: 120.9,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Updated Family cabin');
  });

  it('updates a saved Home location from a selected search result', async () => {
    mocks.savedPlacesState.savedPlaces = [{
      id: 'home',
      kind: 'home',
      name: 'Home',
      addressLabel: 'Current home, Manila',
      lat: 14.6,
      lng: 121,
    }];
    renderAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for a location' }), { target: { value: 'Tagaytay' } });
    fireEvent.click(await screen.findByRole('option', { name: /Tagaytay, Cavite/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.savedPlacesState.save).toHaveBeenCalledWith({
      id: 'home',
      kind: 'home',
      addressLabel: 'Tagaytay, Cavite, Philippines',
      lat: 14.1,
      lng: 120.9,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Updated Home');
  });

  it('explains Home replacement and confirms a removal before calling persistence', async () => {
    mocks.savedPlacesState.savedPlaces = [{
      id: 'home',
      kind: 'home',
      name: 'Home',
      addressLabel: 'Current home, Manila',
      lat: 14.6,
      lng: 121,
    }];
    renderAccount();

    expect(screen.getByText('Saving Home replaces the current shortcut.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Home' }));
    expect(mocks.savedPlacesState.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Home' }));

    await waitFor(() => expect(mocks.savedPlacesState.remove).toHaveBeenCalledWith('home'));
    expect(await screen.findByRole('status')).toHaveTextContent('Removed Home');
  });
});
