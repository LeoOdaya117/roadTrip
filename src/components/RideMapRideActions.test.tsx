import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RideMapRideActions from './RideMapRideActions';

vi.mock('@ionic/react', () => ({ IonIcon: () => <span aria-hidden="true" /> }));

describe('RideMapRideActions', () => {
  it('keeps pause/resume and end actions available independently of sheet expansion', () => {
    render(<RideMapRideActions isTracking busy={false} transition={null} onToggleTracking={vi.fn()} onEndRide={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Ride actions' })).toHaveAttribute('data-ride-actions', 'persistent');
    expect(screen.getByRole('button', { name: 'Pause ride tracking' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'End ride' })).toBeVisible();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'End ride' }));
  });

  it('shows a disabled, labeled transition state for pause and resume', () => {
    const { rerender } = render(<RideMapRideActions isTracking busy transition="pausing" onToggleTracking={vi.fn()} onEndRide={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pausing ride tracking' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausing ride tracking' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Pausing…')).toBeVisible();

    rerender(<RideMapRideActions isTracking={false} busy transition="resuming" onToggleTracking={vi.fn()} onEndRide={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Resuming ride tracking' })).toBeDisabled();
    expect(screen.getByText('Resuming…')).toBeVisible();
  });

  it('keeps cancellation harmless and restores focus to End Ride', () => {
    const onEndRide = vi.fn();
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    document.body.append(appRoot);
    render(<RideMapRideActions isTracking busy={false} transition={null} onToggleTracking={vi.fn()} onEndRide={onEndRide} />);

    const endButton = screen.getByRole('button', { name: 'End ride' });
    fireEvent.click(endButton);
    const cancelButton = screen.getByRole('button', { name: 'Keep riding' });
    expect(screen.getByRole('alertdialog', { name: 'End this ride?' })).toBeVisible();
    expect(screen.getByRole('alertdialog').parentElement?.parentElement).toBe(document.body);
    expect(appRoot).toHaveAttribute('inert');
    expect(cancelButton).toHaveFocus();
    fireEvent.click(cancelButton);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(appRoot).not.toHaveAttribute('inert');
    expect(onEndRide).not.toHaveBeenCalled();
    expect(endButton).toHaveFocus();
    appRoot.remove();
  });

  it('calls the end handler only after explicit confirmation and supports Escape cancellation', () => {
    const onEndRide = vi.fn();
    render(<RideMapRideActions isTracking busy={false} transition={null} onToggleTracking={vi.fn()} onEndRide={onEndRide} />);

    fireEvent.click(screen.getByRole('button', { name: 'End ride' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Confirm end ride' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Keep riding' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onEndRide).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End ride' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm end ride' }));
    expect(onEndRide).toHaveBeenCalledTimes(1);
  });
});
