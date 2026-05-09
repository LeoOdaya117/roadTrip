import React, { useEffect, useState } from 'react';
import { formatDuration } from '../../types/ride';

type Props = {
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedMs?: number;
  maxSpeedMs?: number;
  elevationGainMeters?: number;
};

export default function StatsPanel({ distanceMeters, durationSeconds, avgSpeedMs, maxSpeedMs, elevationGainMeters }: Props) {
  const km = Number((distanceMeters / 1000).toFixed(2));
  const avgKmh = avgSpeedMs ? Number((avgSpeedMs * 3.6).toFixed(1)) : null;
  const maxKmh = maxSpeedMs ? Number((maxSpeedMs * 3.6).toFixed(1)) : null;

  // animated numbers
  const [animKm, setAnimKm] = useState(0);
  const [animAvg, setAnimAvg] = useState(0);
  const [animMax, setAnimMax] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const dur = 700;
    const fromKm = 0;
    const toKm = km;
    const fromAvg = 0;
    const toAvg = avgKmh ?? 0;
    const fromMax = 0;
    const toMax = maxKmh ?? 0;
    function step(now: number) {
      const t = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      setAnimKm(Number((fromKm + (toKm - fromKm) * ease).toFixed(2)));
      setAnimAvg(Number((fromAvg + (toAvg - fromAvg) * ease).toFixed(1)));
      setAnimMax(Number((fromMax + (toMax - fromMax) * ease).toFixed(1)));
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [km, avgKmh, maxKmh]);

  return (
    <div>
      <div className="rh-hero-stats" style={{ marginBottom: 12 }}>
        <div className="rh-hero-stat">
          <div className="rh-hero-value">{animKm}</div>
          <div className="rh-hero-label">km</div>
        </div>
        <div className="rh-hero-stat">
          <div className="rh-hero-value">{formatDuration(durationSeconds)}</div>
          <div className="rh-hero-label">duration</div>
        </div>
      </div>

      <div className="rh-stats-grid">
        <div>
          <div className="rh-stat-title">Avg Speed</div>
          <div className="rh-stat-value">{animAvg} km/h</div>
        </div>
        <div>
          <div className="rh-stat-title">Max Speed</div>
          <div className="rh-stat-value">{animMax} km/h</div>
        </div>
        <div>
          <div className="rh-stat-title">Elevation</div>
          <div className="rh-stat-value">{elevationGainMeters ?? 0} m</div>
        </div>
        <div>
          <div className="rh-stat-title">Pace</div>
          <div className="rh-stat-value rh-muted">—</div>
        </div>
      </div>
    </div>
  );
}
