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

const renderAccount = () => render(<ThemeProvider><AccountPage /></ThemeProvider>);

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.currentUser.name = 'Rider One';
    mocks.currentUser.avatarUrl = undefined;
    mocks.loadUserProfile.mockReturnValue({ name: 'Rider One', avatarUrl: 'data:image/jpeg;base64,old-avatar' });
    mocks.saveUserProfile.mockReturnValue(true);
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
});
