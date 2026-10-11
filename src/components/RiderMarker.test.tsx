import { describe, expect, it } from 'vitest';
import { createRiderMarkerIcon } from './riderMarkerIcon';

const htmlFor = (markerStyle: 'circle' | 'motorcycle' | 'car' | 'bicycle', isCurrentUser = true) => {
  const icon = createRiderMarkerIcon({ riderId: 'rider-1', isCurrentUser, markerStyle, accuracy: 12 });
  return String(icon.options.html);
};

describe('rider map markers', () => {
  it('uses a map location dot by default instead of a profile image', () => {
    const html = htmlFor('circle');
    expect(html).toContain('rider-location-marker--current');
    expect(html).not.toContain('<img');
  });

  it('uses a vehicle glyph only for the current rider', () => {
    expect(htmlFor('motorcycle')).toContain('rider-location-marker--vehicle');
    expect(htmlFor('car')).toContain('<svg');
    expect(htmlFor('bicycle', false)).toContain('rider-location-marker--other');
    expect(htmlFor('bicycle', false)).not.toContain('<svg');
  });
});
