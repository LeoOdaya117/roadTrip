import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShareImageGenerator from './ShareImageGenerator';
import type { Ride } from '../../types/ride';

vi.mock('@ionic/react', () => ({ IonIcon: () => <span aria-hidden="true" /> }));

const ride: Ride = {
  id: 'solo-share-test',
  polylineGeoJSON: { type: 'LineString', coordinates: [[120.98, 14.59], [120.99, 14.6]] },
  distanceMeters: 1200,
  durationSeconds: 500,
  startTimeISO: '2026-10-10T00:00:00.000Z',
  photoUrls: [],
};

describe('ShareImageGenerator', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function prepareSuccessfulGeneration() {
    const gradient = { addColorStop: vi.fn() };
    const drawingContext = new Proxy({
      createLinearGradient: () => gradient,
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>, {
      get: (target, property) => property in target ? target[property as string] : vi.fn(),
      set: (target, property, value) => { target[property as string] = value; return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawingContext as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['image'], { type: 'image/png' })));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:share-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  }

  async function generatePreview() {
    render(<ShareImageGenerator ride={ride} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));
    await screen.findByRole('img', { name: 'share preview' });
  }

  it('shows a generation failure and offers a retry', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<ShareImageGenerator ride={ride} />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Image' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t generate the image: Canvas not supported/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('allows a ride photo background to be selected from the keyboard-accessible control', async () => {
    render(<ShareImageGenerator ride={{ ...ride, photoUrls: ['https://example.test/photo.jpg'] }} />);
    const photoChoice = screen.getByRole('button', { name: 'Use ride photo 1 as background' });
    expect(photoChoice).toHaveAttribute('aria-pressed', 'false');
    photoChoice.focus();
    await userEvent.keyboard('{Enter}');
    expect(photoChoice).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a download failure with a retry action', async () => {
    prepareSuccessfulGeneration();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await generatePreview();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t download the image: offline/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows a blocked browser-share failure with a retry action', async () => {
    prepareSuccessfulGeneration();
    vi.spyOn(window, 'open').mockReturnValue(null);
    await generatePreview();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked the image tab/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
