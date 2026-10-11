import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RideHistoryStatsPage from './RideHistoryStatsPage';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  route: { search: '?mode=replay' },
  fetchRideById: vi.fn(),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ search: mocks.route.search }),
  useHistory: () => ({ push: mocks.push }),
}));
vi.mock('@ionic/react', () => ({
  IonPage: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonToolbar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonButtons: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  IonIcon: () => null,
  IonBackButton: () => <button>Back</button>,
  IonContent: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
}));
vi.mock('../components/Icons/ReplayIcon', () => ({ default: () => <span aria-hidden="true">↻</span> }));
vi.mock('../api/ride', () => ({ fetchRideById: mocks.fetchRideById }));
vi.mock('../components/RideMap/MapView', () => ({ default: () => <div>Ride map</div> }));
vi.mock('../components/RideStats/StatsPanel', () => ({ default: () => <div>Ride stats</div> }));
vi.mock('../components/Gallery/GalleryGrid', () => ({ default: () => <div>Photos</div> }));

describe('RideHistoryStatsPage', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.route.search = '?mode=replay';
    mocks.fetchRideById.mockReset();
    mocks.fetchRideById.mockImplementation(async (id: string) => ({
      id,
      polylineGeoJSON: { type: 'LineString', coordinates: [[120.98, 14.59], [120.99, 14.6]] },
      distanceMeters: 1200,
      durationSeconds: 500,
      startTimeISO: '2026-10-10T00:00:00.000Z',
      photoUrls: [],
    }));
  });

  it('routes the replay action to the functional replay screen', async () => {
    render(<RideHistoryStatsPage rideId="solo-stats-test" />);
    const replay = await screen.findByRole('button', { name: 'Open route replay' });
    fireEvent.click(replay);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect(mocks.push).toHaveBeenCalledWith('/ride-replay/solo-stats-test');
  });

  it('updates replay mode without reloading the same ride', async () => {
    const view = render(<RideHistoryStatsPage rideId="solo-stats-mode" />);
    await screen.findByRole('button', { name: 'Open route replay' });
    expect(mocks.fetchRideById).toHaveBeenCalledTimes(1);

    mocks.route.search = '';
    view.rerender(<RideHistoryStatsPage rideId="solo-stats-mode" />);

    await waitFor(() => expect(screen.getByText('Ride summary')).toBeInTheDocument());
    expect(mocks.fetchRideById).toHaveBeenCalledTimes(1);
  });
});
