import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RideReplayPage from './RideReplayPage';
import { getSession } from '../services/offlineDb';

const { photo, secondPhoto } = vi.hoisted(() => ({
  photo: { id: 17, rideId: 'solo-replay-test', timestamp: '2026-10-10T00:00:00.000Z', note: 'Scenic stop', lat: 14.59, lng: 120.98 },
  secondPhoto: { id: 18, rideId: 'solo-replay-test', timestamp: '2026-10-10T00:00:30.000Z', note: 'Mountain overlook', lat: 14.60, lng: 120.99 },
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ rideId: 'solo-replay-test' }) }));
vi.mock('@ionic/react', () => ({
  useIonViewDidEnter: () => undefined,
  IonPage: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonToolbar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonContent: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
  IonButtons: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonBackButton: () => <button>Back</button>,
  IonButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  IonRange: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="range" {...props} />,
  IonIcon: () => <span aria-hidden="true" />,
  IonModal: ({ isOpen, children }: React.PropsWithChildren<{ isOpen: boolean }>) => isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('ionicons/icons', () => ({ compassOutline: 'compass', play: 'play', pause: 'pause', playSkipBack: 'back', playSkipForward: 'forward' }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  Marker: ({ eventHandlers }: { eventHandlers?: { click?: () => void } }) => <button aria-label="Open map photo" onClick={eventHandlers?.click}>Photo marker</button>,
}));
vi.mock('leaflet', () => ({ default: { divIcon: () => ({}) } }));
vi.mock('../services/offlineDb', () => ({
  getTrackPoints: vi.fn(async () => [{ rideId: 'solo-replay-test', id: 1, pointId: 'point-1', segmentId: 'seg-1', source: 'foreground', lat: 14.59, lng: 120.98, speed: 0, timestamp: '2026-10-10T00:00:00.000Z' }]),
  getPhotos: vi.fn(async () => [
    { ...photo, data: new Blob(['first full image'], { type: 'image/jpeg' }) },
    { ...secondPhoto, data: new Blob(['second full image'], { type: 'image/jpeg' }) },
  ]),
  getSession: vi.fn(async () => ({ rideId: 'solo-replay-test', userId: 'rider', userName: 'Rider', isHost: true, createdAt: '2026-10-10T00:00:00.000Z' })),
}));
vi.mock('../services/locationFilter', () => ({ splitTrackSegments: (points: unknown[]) => [points] }));

describe('RideReplayPage photos', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports an unknown ride instead of presenting an empty replay as a session', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(undefined);
    render(<RideReplayPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('was not found on this device');
    expect(screen.queryByText('No recorded track points are available for this session.')).not.toBeInTheDocument();
  });

  it('uses the full photo as a thumbnail fallback and opens its selected-photo view', async () => {
    let nextUrl = 0;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:replay-${++nextUrl}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    render(<RideReplayPage />);

    const jumpButton = await screen.findByRole('button', { name: 'Jump to photo 1: Scenic stop' });
    await waitFor(() => expect(jumpButton.querySelector('img')?.getAttribute('src')).toMatch(/^blob:replay-/));
    fireEvent.click(jumpButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Scenic stop' })).toHaveAttribute('src', expect.stringMatching(/^blob:replay-/));
    fireEvent.click(screen.getByRole('button', { name: 'Close selected photo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves between photos in the gallery and closes back to the replay page', async () => {
    let nextUrl = 0;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:gallery-${++nextUrl}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    render(<RideReplayPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open photo gallery' }));

    const gallery = await screen.findByRole('dialog');
    expect(within(gallery).getByRole('img', { name: 'Scenic stop' })).toBeInTheDocument();
    expect(within(gallery).getByRole('button', { name: 'Previous photo' })).toBeDisabled();
    expect(within(gallery).getByRole('button', { name: 'Next photo' })).toBeEnabled();

    fireEvent.click(within(gallery).getByRole('button', { name: 'Next photo' }));
    expect(within(gallery).getByRole('img', { name: 'Mountain overlook' })).toBeInTheDocument();
    expect(within(gallery).getByRole('button', { name: 'Previous photo' })).toBeEnabled();
    expect(within(gallery).getByRole('button', { name: 'Next photo' })).toBeDisabled();

    fireEvent.click(within(gallery).getByRole('button', { name: 'Previous photo' }));
    expect(within(gallery).getByRole('img', { name: 'Scenic stop' })).toBeInTheDocument();

    fireEvent.click(within(gallery).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open photo gallery' })).toBeVisible();
  });
});
