import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapStyleSwitcher from './MapStyleSwitcher';

vi.mock('@ionic/react', () => ({ IonIcon: () => <span aria-hidden="true" /> }));
vi.mock('ionicons/icons', () => ({ bicycle: 'bicycle', carSport: 'car' }));

const layer = { id: 'osm', label: 'OpenStreetMap', url: 'tiles', attribution: 'Map data' };

describe('MapStyleSwitcher marker controls', () => {
  it('shows the selected marker and emits device preference changes', () => {
    const onChangeMarkerStyle = vi.fn();
    render(
      <MapStyleSwitcher
        layers={[layer]}
        activeLayerId="osm"
        onChange={vi.fn()}
        overlays={[{ id: 'riders', label: 'Riders' }]}
        enabledOverlays={['riders']}
        onToggleOverlay={vi.fn()}
        markerStyle="circle"
        onChangeMarkerStyle={onChangeMarkerStyle}
      />
    );

    expect(screen.getByRole('button', { name: 'Use location dot marker' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Use motorcycle marker' }));
    expect(onChangeMarkerStyle).toHaveBeenCalledWith('motorcycle');
  });
});
