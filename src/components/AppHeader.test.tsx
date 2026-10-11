import type { PropsWithChildren } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/react', () => ({
  IonBackButton: ({ defaultHref }: { defaultHref: string }) => <button data-default-href={defaultHref}>Back</button>,
  IonButtons: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  IonHeader: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => <header {...props}>{children}</header>,
  IonTitle: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
  IonToolbar: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
}));

import AppHeader from './AppHeader';

describe('AppHeader', () => {
  it('renders a shared title and accessible action without adding back navigation', () => {
    render(<AppHeader title="RoadTrip" actions={<button type="button" aria-label="Account">Profile</button>} />);

    expect(screen.getByRole('heading', { name: 'RoadTrip' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'RoadTrip' })).toHaveClass('rt-app-header__title');
    expect(screen.getByRole('heading', { name: 'RoadTrip' }).closest('.rt-app-header__identity')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'RoadTrip' })).toHaveStyle({
      fontSize: 'clamp(16px, 4vw, 18px)',
      fontWeight: '700',
      letterSpacing: '-0.02em',
    });
    expect(screen.getByRole('banner')).toHaveClass('rt-app-header', 'ion-no-border');
    expect(screen.getByRole('banner').querySelector('.rt-app-header__toolbar')).toBeInTheDocument();
    expect(screen.getByRole('banner').querySelector('.rt-app-header__identity')).toHaveAttribute('slot', 'start');
    expect(screen.getByRole('banner').querySelector('.rt-app-header__mark')).toBeNull();
    expect(screen.getByRole('banner').querySelector('ion-icon')).toBeNull();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('preserves the supplied default destination for back navigation', () => {
    render(<AppHeader title="Ride History" backHref="/home" />);

    expect(screen.getByRole('heading', { name: 'Ride History' })).toBeInTheDocument();
    expect(screen.getByRole('banner').querySelector('.rt-app-header__identity')).toHaveAttribute('slot', 'primary');
    expect(screen.getByRole('button', { name: 'Back' }).closest('.rt-app-header__back')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute('data-default-href', '/home');
  });
});
