import React, { useState } from 'react';
import type { Ride } from '../../types/ride';

type Props = { ride: Ride };

function extractCoords(geo: GeoJSON.GeoJSON): [number, number][] {
  if ((geo as GeoJSON.Feature)?.type === 'Feature') {
    const feat = geo as GeoJSON.Feature;
    if (feat.geometry.type === 'LineString') return feat.geometry.coordinates as [number, number][];
  } else if ((geo as GeoJSON.LineString)?.type === 'LineString') {
    return (geo as GeoJSON.LineString).coordinates as [number, number][];
  }
  return [];
}

export default function ShareImageGenerator({ ride }: Props) {
  const [generating, setGenerating] = useState(false);
  const [pngUrl, setPngUrl] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    try {
      const outW = 1080;
      const outH = 1920;
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      // background gradient
      const g = ctx.createLinearGradient(0, 0, 0, outH * 0.6);
      g.addColorStop(0, '#06111a');
      g.addColorStop(1, '#0b1722');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, outW, Math.floor(outH * 0.6));

      // draw stylized polyline centered in the top area
      const coords = extractCoords(ride.polylineGeoJSON);
      if (coords.length > 0) {
        let minX = coords[0][0], maxX = coords[0][0], minY = coords[0][1], maxY = coords[0][1];
        coords.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });
        const pad = 60;
        const mapW = outW - pad * 2;
        const mapH = Math.floor(outH * 0.55) - pad * 2;
        const worldW = maxX - minX || 1;
        const worldH = maxY - minY || 1;
        const scale = Math.min(mapW / worldW, mapH / worldH);
        const toCanvas = (lon: number, lat: number) => {
          const x = (lon - minX) * scale + pad;
          const y = Math.floor(outH * 0.55) - ((lat - minY) * scale + pad);
          return [x, y];
        };

        ctx.lineWidth = 14;
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        coords.forEach((c, idx) => {
          const [x, y] = toCanvas(c[0], c[1]);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.lineWidth = 8;
        const trackGrad = ctx.createLinearGradient(0, 0, outW, 0);
        trackGrad.addColorStop(0, '#ff6b2d');
        trackGrad.addColorStop(1, '#ff9b5a');
        ctx.strokeStyle = trackGrad;
        ctx.beginPath();
        coords.forEach((c, idx) => {
          const [x, y] = toCanvas(c[0], c[1]);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        const s = toCanvas(coords[0][0], coords[0][1]);
        ctx.fillStyle = '#34D399';
        ctx.beginPath(); ctx.arc(s[0], s[1], 8, 0, Math.PI * 2); ctx.fill();
      }

      // lower stats area
      ctx.fillStyle = '#071021';
      ctx.fillRect(0, Math.floor(outH * 0.6), outW, Math.floor(outH * 0.4));

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 44px Inter, system-ui, Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const padText = 72;
      let y = Math.floor(outH * 0.62);
      ctx.fillText('Ride Summary', padText, y);
      y += 64;

      ctx.font = '600 36px Inter, system-ui, Arial';
      const km = (ride.distanceMeters / 1000).toFixed(2);
      const duration = (() => {
        const s = ride.durationSeconds;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m ${ss}s`;
      })();

      ctx.fillText(`Distance: ${km} km`, padText, y);
      ctx.fillText(`Duration: ${duration}`, padText + 460, y);
      y += 46;
      const avg = ride.avgSpeedMs ? (ride.avgSpeedMs * 3.6).toFixed(1) : '-';
      const max = ride.maxSpeedMs ? (ride.maxSpeedMs * 3.6).toFixed(1) : '-';
      ctx.fillText(`Avg: ${avg} km/h`, padText, y);
      ctx.fillText(`Max: ${max} km/h`, padText + 460, y);
      y += 46;
      ctx.fillText(`Elevation: ${ride.elevationGainMeters ?? 0} m`, padText, y);

      const dataUrl = out.toDataURL('image/png');
      setPngUrl(dataUrl);
    } catch (err) {
      console.error('Failed to generate share image', err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button className="rh-generate-btn" onClick={generate} disabled={generating}>{generating ? 'Generating…' : 'Generate'}</button>
        {pngUrl && (
          <a href={pngUrl} download={`ride-${ride.id}.png`} className="rh-generate-btn">Download PNG</a>
        )}
      </div>
      {pngUrl && (
        <div style={{ marginTop: 12 }}>
          <img src={pngUrl} alt="share preview" style={{ maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 10px rgba(0,0,0,0.12)' }} />
        </div>
      )}
    </div>
  );
}
