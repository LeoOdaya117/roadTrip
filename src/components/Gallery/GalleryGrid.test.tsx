import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GalleryGrid from './GalleryGrid';

describe('GalleryGrid', () => {
  it('opens a photo from its keyboard-operable named button', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<GalleryGrid photoUrls={['https://example.test/ride-photo.jpg']} />);
    const photoButton = screen.getByRole('button', { name: 'Open ride photo 1 in a new tab' });
    photoButton.focus();
    await userEvent.keyboard('{Enter}');
    expect(open).toHaveBeenCalledWith('https://example.test/ride-photo.jpg', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('announces an empty gallery', () => {
    render(<GalleryGrid photoUrls={[]} />);
    expect(screen.getByText('No photos for this ride.')).toBeInTheDocument();
  });
});
