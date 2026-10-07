import React from 'react';
import { render, screen } from '@testing-library/react';
import MapView from './MapView';

describe('MapView', () => {
  it('shows a clear empty state when a ride has no recorded route points', () => {
    render(
      <MapView
        polylineGeoJSON={{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {}
        }}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'No route points were recorded for this ride.'
    );
  });
});
