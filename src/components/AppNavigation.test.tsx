import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppNavigation from './AppNavigation';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/home',
}));

vi.mock('@ionic/react', () => ({ IonIcon: () => null }));
vi.mock('ionicons/icons', () => ({ homeOutline: 'home', personOutline: 'person', timeOutline: 'time' }));
vi.mock('react-router-dom', () => ({
  useHistory: () => ({ push: mocks.push }),
  useLocation: () => ({ pathname: mocks.pathname }),
}));

describe('AppNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/home';
  });

  it('does not push a duplicate history entry when the active item is clicked', () => {
    render(<AppNavigation />);

    const homeButton = screen.getByRole('button', { name: 'Home' });
    expect(homeButton).toHaveAttribute('aria-current', 'page');
    fireEvent.click(homeButton);

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('pushes the destination once when an inactive item is clicked', () => {
    render(<AppNavigation />);

    fireEvent.click(screen.getByRole('button', { name: 'Rides' }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/ride-history');
  });
});
