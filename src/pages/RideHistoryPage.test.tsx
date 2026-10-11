import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RideSession } from '../types/ride';
import RideHistoryPage from './RideHistoryPage';

const db = vi.hoisted(() => ({
  getSessionsPage: vi.fn(),
  getTrackPoints: vi.fn(),
  getPhotos: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('../services/offlineDb', () => db);
vi.mock('../services/locationFilter', () => ({ splitTrackSegments: (points: unknown[]) => [points] }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('@ionic/react', async () => {
  const ReactModule = await import('react');
  type FilterChange = (event: { detail: { value?: string } }) => void;
  type SegmentButtonProps = React.PropsWithChildren<{ value: string; onIonChange?: FilterChange }>;
  type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { routerLink?: string; fill?: string };
  type ItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { routerLink?: string; button?: boolean };
  type AlertButton = { text: string; role?: string; handler?: () => void };
  const Empty = () => null;
  return {
    IonPage: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    IonHeader: ({ children }: React.PropsWithChildren) => <header>{children}</header>,
    IonToolbar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    IonTitle: ({ children }: React.PropsWithChildren) => <h1>{children}</h1>,
    IonContent: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
    IonButtons: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    IonIcon: () => null,
    IonBackButton: Empty,
    IonLabel: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    IonSegment: ({ children, onIonChange, value }: React.PropsWithChildren<{ onIonChange: FilterChange; value: string }>) => <div role="group" aria-label="Filter ride history" data-value={value}>
      {ReactModule.Children.map(children, (child) => ReactModule.isValidElement<SegmentButtonProps>(child)
        ? ReactModule.cloneElement(child, { onIonChange })
        : child)}
    </div>,
    IonSegmentButton: ({ children, value, onIonChange }: SegmentButtonProps) => <button type="button" onClick={() => onIonChange?.({ detail: { value } })}>{children}</button>,
    IonButton: (props: ButtonProps) => {
      const { children, routerLink, fill, ...buttonProps } = props;
      void fill;
      return <button type="button" {...buttonProps} data-router-link={routerLink}>{children}</button>;
    },
    IonItem: (props: ItemProps) => {
      const { children, routerLink, button, ...buttonProps } = props;
      void routerLink;
      void button;
      return <div {...(buttonProps as unknown as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
    },
    IonItemSliding: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    IonItemOptions: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    IonItemOption: (props: React.ButtonHTMLAttributes<HTMLButtonElement> & { color?: string }) => {
      const { children, color, ...buttonProps } = props;
      void color;
      return <button type="button" {...buttonProps}>{children}</button>;
    },
    IonInfiniteScroll: ({ children, onIonInfinite, disabled }: React.PropsWithChildren<{ onIonInfinite: (event: CustomEvent & { target: HTMLIonInfiniteScrollElement }) => void; disabled: boolean }>) => <div>{children}<button type="button" disabled={disabled} onClick={() => onIonInfinite({ target: { complete: vi.fn() } } as unknown as CustomEvent & { target: HTMLIonInfiniteScrollElement })}>Load more rides</button></div>,
    IonInfiniteScrollContent: Empty,
    IonToast: Empty,
    IonAlert: ({ isOpen, header, message, buttons = [], onDidDismiss }: { isOpen: boolean; header: string; message: string; buttons?: AlertButton[]; onDidDismiss?: (event: { detail: { role?: string } }) => void }) => isOpen ? <div role="dialog" aria-label={header}>
      <p>{message}</p>{buttons.map((button) => <button key={button.text} type="button" onClick={() => { button.handler?.(); onDidDismiss?.({ detail: { role: button.role } }); }}>{button.text}</button>)}
    </div> : null,
  };
});

const ride = (rideId: string, isSolo: boolean): RideSession => ({
  rideId,
  isSolo,
  createdAt: '2026-01-02T10:00:00.000Z',
  userName: 'Rider',
  distanceMeters: 1200,
  durationSeconds: 80,
  status: 'ended',
} as RideSession);

const pageOf = (...rows: RideSession[]) => rows;
const CurrentPath = () => <output data-testid="current-path">{useLocation().pathname}</output>;
const renderPage = () => render(<MemoryRouter><RideHistoryPage /><CurrentPath /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  db.getSessionsPage.mockResolvedValue([]);
  db.getTrackPoints.mockResolvedValue([]);
  db.getPhotos.mockResolvedValue([]);
  db.deleteSession.mockResolvedValue(undefined);
});

describe('RideHistoryPage', () => {
  it('filters rides and links each ride row to its summary', async () => {
    db.getSessionsPage.mockResolvedValue(pageOf(ride('solo-1', true), ride('group-1', false)));
    renderPage();

    expect(await screen.findByText('Group ride')).toBeInTheDocument();
    expect(screen.queryByText('Solo ride')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Solo' }));
    const soloRow = screen.getByText('Solo ride');
    fireEvent.click(soloRow);
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/ride-history-stats/solo-1'));
    expect(screen.queryByText('Group ride')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Group' }));
    expect(screen.getByText('Group ride')).toBeInTheDocument();
  });

  it('advances pagination without resetting back to page one when hasMore changes', async () => {
    const firstPage = Array.from({ length: 8 }, (_, index) => ride(`group-${index}`, false));
    db.getSessionsPage.mockImplementation((requestedPage: number) => Promise.resolve(
      requestedPage === 1 ? pageOf(...firstPage) : pageOf(ride('group-next', false)),
    ));
    renderPage();
    await waitFor(() => expect(document.querySelectorAll('.history-card')).toHaveLength(8));
    fireEvent.click(screen.getByRole('button', { name: 'Load more rides' }));

    await waitFor(() => expect(document.querySelectorAll('.history-card')).toHaveLength(9));
    await waitFor(() => expect(db.getSessionsPage).toHaveBeenCalledTimes(2));
    expect(db.getSessionsPage.mock.calls.map(([requestedPage]) => requestedPage)).toEqual([1, 2]);
  });

  it('retries a failed later page without discarding previously loaded rides', async () => {
    const firstPage = Array.from({ length: 8 }, (_, index) => ride(`group-first-${index}`, false));
    const secondPage = Array.from({ length: 8 }, (_, index) => ride(`group-second-${index}`, false));
    db.getSessionsPage
      .mockResolvedValueOnce(pageOf(...firstPage))
      .mockResolvedValueOnce(pageOf(...secondPage))
      .mockRejectedValueOnce(new Error('Page three failed'))
      .mockResolvedValueOnce(pageOf(ride('group-third-0', false)));
    renderPage();

    await waitFor(() => expect(document.querySelectorAll('.history-card')).toHaveLength(8));
    fireEvent.click(screen.getByRole('button', { name: 'Load more rides' }));
    await waitFor(() => expect(document.querySelectorAll('.history-card')).toHaveLength(16));
    fireEvent.click(screen.getByRole('button', { name: 'Load more rides' }));
    expect(await screen.findByText('Page three failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry page 3' }));

    await waitFor(() => expect(document.querySelectorAll('.history-card')).toHaveLength(17));
    expect(db.getSessionsPage.mock.calls.map(([requestedPage]) => requestedPage)).toEqual([1, 2, 3, 3]);
  });

  it('shows page-load errors and retries the failed page', async () => {
    db.getSessionsPage.mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading rides' }));
    expect(await screen.findByText('No group rides yet')).toBeInTheDocument();
    expect(db.getSessionsPage).toHaveBeenCalledTimes(2);
  });

  it('shows route prefetch failures with a retry action', async () => {
    db.getSessionsPage.mockResolvedValue(pageOf(ride('group-1', false)));
    db.getTrackPoints.mockRejectedValueOnce(new Error('Track read failed')).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText('Could not load this route preview.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry route' }));
    await waitFor(() => expect(db.getTrackPoints).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Could not load this route preview.')).not.toBeInTheDocument();
  });

  it('shows photo prefetch failures with a retry action', async () => {
    db.getSessionsPage.mockResolvedValue(pageOf(ride('group-1', false)));
    db.getPhotos.mockRejectedValueOnce(new Error('Photo read failed')).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText('Could not load ride photos.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry photos' }));
    await waitFor(() => expect(db.getPhotos).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Could not load ride photos.')).not.toBeInTheDocument();
  });

  it('keeps a ride when deletion is cancelled and removes it after confirmation', async () => {
    db.getSessionsPage.mockResolvedValue(pageOf(ride('group-1', false)));
    renderPage();
    await screen.findByText('Group ride');
    fireEvent.click(screen.getByRole('button', { name: /Delete ride from/ }));
    const firstDialog = screen.getByRole('dialog', { name: 'Delete this ride?' });
    fireEvent.click(within(firstDialog).getByRole('button', { name: 'Cancel' }));
    expect(db.deleteSession).not.toHaveBeenCalled();
    expect(screen.getByText('Group ride')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Delete ride from/ }));
    const secondDialog = screen.getByRole('dialog', { name: 'Delete this ride?' });
    fireEvent.click(within(secondDialog).getByRole('button', { name: 'Delete ride' }));
    await waitFor(() => expect(screen.queryByText('Group ride')).not.toBeInTheDocument());
    expect(db.deleteSession).toHaveBeenCalledWith('group-1');
  });

  it('shows a retry when deleting a ride fails', async () => {
    db.getSessionsPage.mockResolvedValue(pageOf(ride('group-1', false)));
    db.deleteSession.mockRejectedValueOnce(new Error('Database is busy'));
    renderPage();
    await screen.findByText('Group ride');
    fireEvent.click(screen.getByRole('button', { name: /Delete ride from/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete ride' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is busy');
    db.deleteSession.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry delete' }));
    await waitFor(() => expect(screen.queryByText('Group ride')).not.toBeInTheDocument());
  });
});
