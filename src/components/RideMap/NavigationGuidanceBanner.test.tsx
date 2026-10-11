import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NavigationGuidanceBanner from './NavigationGuidanceBanner';

const renderBanner = (overrides: Partial<React.ComponentProps<typeof NavigationGuidanceBanner>> = {}) => {
  const props: React.ComponentProps<typeof NavigationGuidanceBanner> = {
    isGuiding: true,
    isTracking: true,
    isRouting: false,
    supported: true,
    hasLocation: true,
    hasRoute: true,
    navigationError: null,
    instruction: 'Turn left onto Main Street',
    distanceToNextManeuverMeters: 275,
    streetName: null,
    ...overrides,
  };
  return render(<NavigationGuidanceBanner {...props} />);
};

describe('NavigationGuidanceBanner', () => {
  it('maps known direction prefixes and keeps unknown maneuver text generic', () => {
    for (const [instruction, direction] of [
      ['Turn left onto Cedar Ave', 'left'],
      ['Bear right at the fork', 'right'],
      ['Continue on the road', 'straight'],
      ['Make a U-turn', 'u-turn'],
      ['Take the second exit at the roundabout', 'unknown'],
    ]) {
      const { unmount } = renderBanner({ instruction });
      expect(document.querySelector('.navigation-guidance-icon')).toHaveAttribute('data-direction', direction);
      unmount();
    }
  });

  it('normalizes instruction whitespace and formats rounded distances in meters', () => {
    const { rerender } = renderBanner({
      instruction: '  Turn  left\nonto Main Street  ',
      distanceToNextManeuverMeters: 1_249.6,
    });
    expect(screen.getByText('Turn left onto Main Street')).toBeInTheDocument();
    expect(screen.getByText('1,250 m')).toBeInTheDocument();

    rerender(<NavigationGuidanceBanner
      isGuiding
      isTracking
      isRouting={false}
      supported
      hasLocation
      hasRoute
      navigationError={null}
      instruction="Turn left"
      distanceToNextManeuverMeters={-5}
    />);
    expect(screen.getByText('0 m')).toBeInTheDocument();

    rerender(<NavigationGuidanceBanner
      isGuiding
      isTracking
      isRouting={false}
      supported
      hasLocation
      hasRoute
      navigationError={null}
      instruction="Turn left"
      distanceToNextManeuverMeters={Number.NaN}
    />);
    expect(screen.getByRole('status')).toHaveTextContent('Updating distance');
  });

  it('shows the current maneuver, distance, and only a supplied street name', () => {
    const { rerender } = renderBanner({
      instruction: ' Turn   left onto Cedar Avenue ',
      distanceToNextManeuverMeters: 1_249.6,
      streetName: 'Cedar Avenue',
    });

    expect(screen.getByLabelText('1,250 m to next maneuver')).toBeInTheDocument();
    expect(screen.getByText('Turn left onto Cedar Avenue')).toBeInTheDocument();
    expect(screen.getByText('Cedar Avenue')).toBeInTheDocument();
    expect(document.querySelector('.navigation-guidance-icon')).toHaveAttribute('data-direction', 'left');

    rerender(<NavigationGuidanceBanner
      isGuiding
      isTracking
      isRouting={false}
      supported
      hasLocation
      hasRoute
      navigationError={null}
      instruction="Turn left onto Cedar Avenue"
      distanceToNextManeuverMeters={80}
    />);
    expect(screen.queryByText('Cedar Avenue')).not.toBeInTheDocument();
  });

  it('uses a generic icon when an instruction has no recognized direction prefix', () => {
    renderBanner({ instruction: 'Take the second exit at the roundabout' });
    expect(document.querySelector('.navigation-guidance-icon')).toHaveAttribute('data-direction', 'unknown');
    expect(screen.getByText('Take the second exit at the roundabout')).toBeInTheDocument();
  });

  it.each([
    [{ isRouting: true }, 'Updating route'],
    [{ isTracking: false }, 'Guidance paused'],
    [{ hasLocation: false }, 'Waiting for GPS'],
    [{ hasRoute: false, navigationError: 'route failed' }, 'Route unavailable'],
    [{ hasRoute: false }, 'Waiting for route'],
    [{ supported: false }, 'Turn-by-turn unavailable'],
    [{ instruction: null }, 'No upcoming turn'],
    [{ distanceToNextManeuverMeters: null }, 'Updating distance'],
  ] as const)('suppresses maneuver details in the %s state', (overrides, expectedStatus) => {
    renderBanner(overrides);

    expect(screen.getByRole('status')).toHaveTextContent(expectedStatus);
    expect(screen.queryByText('Turn left onto Main Street')).not.toBeInTheDocument();
    expect(screen.queryByText('275 m')).not.toBeInTheDocument();
  });

  it('replaces the last instruction, distance, and street with Waiting for GPS after freshness expires', () => {
    renderBanner({
      hasLocation: false,
      instruction: 'Turn left',
      streetName: 'Cedar Avenue',
      distanceToNextManeuverMeters: 45,
    });

    expect(screen.getByRole('status')).toHaveTextContent('Waiting for GPS');
    expect(screen.queryByText('Turn left')).not.toBeInTheDocument();
    expect(screen.queryByText('Cedar Avenue')).not.toBeInTheDocument();
    expect(screen.queryByText('45 m')).not.toBeInTheDocument();
  });

  it('does not render when guidance is stopped', () => {
    const { container } = renderBanner({ isGuiding: false });
    expect(container).toBeEmptyDOMElement();
  });
});
