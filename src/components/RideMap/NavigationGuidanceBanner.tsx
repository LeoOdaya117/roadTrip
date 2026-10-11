type Props = {
  isGuiding: boolean;
  isTracking: boolean;
  isRouting: boolean;
  supported: boolean;
  hasLocation: boolean;
  hasRoute: boolean;
  navigationError: string | null;
  instruction: string | null;
  distanceToNextManeuverMeters: number | null;
  streetName?: string | null;
};

type ManeuverDirection = 'left' | 'right' | 'straight' | 'u-turn' | 'unknown';

const normalizeManeuverInstruction = (instruction: string) =>
  instruction.replace(/\s+/g, ' ').trim();

const getManeuverDirection = (instruction: string): ManeuverDirection => {
  const normalized = normalizeManeuverInstruction(instruction);
  const lead = normalized.split(/\b(?:onto|on|at|after|before|toward|towards)\b/i)[0].trim();
  if (/^(?:(?:make\s+(?:a\s+)?)?u[\s-]?turn|turn around)\b/i.test(lead)) return 'u-turn';
  if (/^(?:turn|bear|keep|take|veer|slight|sharp|make)\b/i.test(lead) && /\bleft\b/i.test(lead)) return 'left';
  if (/^(?:turn|bear|keep|take|veer|slight|sharp|make)\b/i.test(lead) && /\bright\b/i.test(lead)) return 'right';
  if (/^(?:continue|go|head|proceed|keep)\b/i.test(lead)) return 'straight';
  return 'unknown';
};

const formatDistanceToManeuverMeters = (distanceMeters: number | null) => {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return null;
  const roundedMeters = Math.max(0, Math.round(distanceMeters));
  return `${roundedMeters.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} m`;
};

const DIRECTION_GLYPHS: Record<ManeuverDirection, string> = {
  left: '↰',
  right: '↱',
  straight: '↑',
  'u-turn': '↶',
  unknown: '•',
};

const NavigationGuidanceBanner: React.FC<Props> = ({
  isGuiding,
  isTracking,
  isRouting,
  supported,
  hasLocation,
  hasRoute,
  navigationError,
  instruction,
  distanceToNextManeuverMeters,
  streetName,
}) => {
  if (!isGuiding) return null;

  const normalizedInstruction = instruction ? normalizeManeuverInstruction(instruction) : '';
  const normalizedStreetName = streetName?.replace(/\s+/g, ' ').trim();
  const distance = formatDistanceToManeuverMeters(distanceToNextManeuverMeters);
  let statusTitle: string | null = null;
  let statusDetail: string | null = null;

  if (!supported) {
    statusTitle = 'Turn-by-turn unavailable';
    statusDetail = 'Navigation is not available on this device.';
  } else if (!isTracking) {
    statusTitle = 'Guidance paused';
    statusDetail = 'Resume the ride to continue directions.';
  } else if (isRouting) {
    statusTitle = 'Updating route';
    statusDetail = 'Your next turn is being recalculated.';
  } else if (!hasLocation) {
    statusTitle = 'Waiting for GPS';
    statusDetail = 'The next turn will appear when your location returns.';
  } else if (!hasRoute) {
    statusTitle = navigationError ? 'Route unavailable' : 'Waiting for route';
    statusDetail = navigationError
      ? 'The current direction is no longer available.'
      : 'A direction will appear when the route is ready.';
  } else if (!normalizedInstruction) {
    statusTitle = 'No upcoming turn';
    statusDetail = 'Continue to your destination.';
  } else if (!distance) {
    statusTitle = 'Updating distance';
    statusDetail = 'Your next turn is being refreshed.';
  }

  const direction = normalizedInstruction ? getManeuverDirection(normalizedInstruction) : 'unknown';

  return (
    <aside
      className={`navigation-guidance-banner${statusTitle ? ' navigation-guidance-banner-status' : ''}`}
      aria-label="Turn-by-turn guidance"
    >
      <span className="navigation-guidance-icon" data-direction={direction} aria-hidden="true">
        {DIRECTION_GLYPHS[direction]}
      </span>
      {statusTitle ? (
        <div className="navigation-guidance-copy" role="status">
          <strong>{statusTitle}</strong>
          {statusDetail && <span>{statusDetail}</span>}
        </div>
      ) : (
        <div className="navigation-guidance-copy">
          <span className="navigation-guidance-distance" aria-label={`${distance} to next maneuver`}>
            {distance}
          </span>
          <strong aria-live="polite">{normalizedInstruction}</strong>
          {normalizedStreetName && <span className="navigation-guidance-street">{normalizedStreetName}</span>}
        </div>
      )}
    </aside>
  );
};

export default NavigationGuidanceBanner;
