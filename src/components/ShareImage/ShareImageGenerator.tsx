import React, { useState, useRef } from 'react';
import type { Ride } from '../../types/ride';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
  const [overlayColor, setOverlayColor] = useState('#000000');
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [routeTitle, setRouteTitle] = useState(() => {
    try {
      return ride.startTimeISO ? new Date(ride.startTimeISO).toLocaleDateString() : '';
    } catch (e) {
      return '';
    }
  });
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [weatherMode, setWeatherMode] = useState<'auto' | 'none' | 'manual'>('auto');
  const [manualWeather, setManualWeather] = useState('');
  const [geoPermissionDenied, setGeoPermissionDenied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // fixed constants (single configured setting)
  const CARD_ALPHA = 0.62;
  const SHADOW_BLUR = 28;
  const OVERLAY_OPACITY = 0.12;

  // revoke object URL when component unmounts
  React.useEffect(() => {
    return () => {
      if (pngUrl && pngUrl.startsWith('blob:')) URL.revokeObjectURL(pngUrl);
    };
  }, [pngUrl]);

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
      // background: either provided image (cover) or default gradient
      if (bgImageUrl) {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = bgImageUrl;
        });
        const ratio = Math.max(outW / img.width, outH / img.height);
        const iw = img.width * ratio;
        const ih = img.height * ratio;
        const ix = (outW - iw) / 2;
        const iy = (outH - ih) / 2;
        ctx.drawImage(img, ix, iy, iw, ih);
      } else {
        const bg = ctx.createLinearGradient(0, 0, 0, outH);
        bg.addColorStop(0, '#06111a');
        bg.addColorStop(1, '#041017');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, outW, outH);
      }

      // Redesigned layout with equal spacing between sections
      const topPadding = 60;
      const bottomPadding = 100; // increased bottom padding for extra breathing room
      const sectionGap = 50;  // gap between title/map/stats
      const mapPad = 48;
      
      // Title and locations area
      const titleAreaY = topPadding;
      const titleFontSize = 48;
      const locationFontSize = 30;
      const titleHeight = titleFontSize + 20;  // title + spacing below
      const labelFontSize = Math.round(titleFontSize * 0.78);
      const smallTagFont = 16;
      const locationHeight = locationFontSize + 10;
      // include space for ride-type label, small tags, and locations
      const titleAreaHeight = titleHeight + labelFontSize + smallTagFont + locationHeight + 20;
      
      // Map area
      const mapY = titleAreaY + titleAreaHeight + sectionGap;
      const mapX = mapPad;
      const mapW = outW - mapPad * 2;
      const mapH = 700;  // fixed height for map
      
      // Stats area
      const statsAreaY = mapY + mapH + sectionGap;
      const statsAreaH = outH - statsAreaY - bottomPadding;
      
      const radius = 20;

      // precompute small header values (date/time/weather) so stats can show them
      let timeText = '';
      let weatherText = '';
      let weatherIcon = '';

      // route title and locations at top
      // Always render the header area (ride type should always show). Locations render only if provided.
      if (true) {
        // header layout constants (shared left padding and colors)
        const headerLeft = mapX + 24;
        const headerTextColor = 'rgba(255,255,255,0.95)';
        const headerShadowColor = 'rgba(0,0,0,0.6)';
        const headerShadowBlur = 14;
        try {
          if (weatherMode === 'manual') {
            weatherText = manualWeather || '';
          } else if (weatherMode === 'auto') {
            // Prefer the device's current GPS position for "exact" current weather
            // If permission denied or unavailable, fall back to the ride start coordinate
            let lat: number | null = null;
            let lon: number | null = null;

            // try navigator.geolocation (may prompt user)
            if (typeof navigator !== 'undefined' && navigator.geolocation) {
              try {
                const pos = await new Promise<GeolocationPosition>((res, rej) => {
                  navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 5000 });
                });
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;
              } catch (geoErr: any) {
                // If permission denied, record state so UI can show a friendly hint
                if (geoErr && (geoErr.code === 1 || geoErr.PERMISSION_DENIED)) {
                  setGeoPermissionDenied(true);
                }
              }
            }

            // fall back to ride start coordinate
            const coordsForWeather = extractCoords(ride.polylineGeoJSON);
            if ((lat == null || lon == null) && coordsForWeather && coordsForWeather.length > 0) {
              const spt = coordsForWeather[0];
              lon = spt[0];
              lat = spt[1];
            }

            if (lat != null && lon != null) {
              // Use Open‑Meteo current_weather endpoint with timezone auto
              const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
              const wresp = await fetch(url);
              if (wresp.ok) {
                const wj = await wresp.json();
                const cw = wj.current_weather;
                if (cw) {
                  const code = cw.weathercode;
                  const temp = cw.temperature;
                  const codeMap: Record<number, string> = {
                    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
                    45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 61: 'Rain',
                    71: 'Snow', 80: 'Rain showers', 95: 'Thunderstorm'
                  };
                  const desc = codeMap[code] || 'Clear';
                  // simple emoji mapping for an icon
                  const emojiMap: Record<number, string> = {
                    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
                    45: '🌫️', 48: '🌫️', 51: '🌦️', 61: '🌧️',
                    71: '❄️', 80: '🌧️', 95: '⛈️'
                  };
                  weatherIcon = emojiMap[code] || '☀️';
                  // current_weather provides the instantaneous observation at request time
                  weatherText = `${desc} ${Math.round(temp)}°C`;
                }
              }
            }
          } else {
            weatherText = '';
          }
        } catch (e) {
          weatherText = '';
        }

        const rideTypeText = (ride.id && String(ride.id).startsWith('solo-')) ? 'Solo Ride' : 'Group Ride';
        // measured height of ride-type text (fallback to titleFontSize)
        let rtHeight = titleFontSize;
        // declare header layout vars so they are available outside the try block
        let rideTypeFontSize = Math.round(titleFontSize * 0.78);
        let headerLineGap = 8;

        // draw ride type as its own line under the title (left aligned)
        try {
          // Title (if provided)
          if (routeTitle) {
            ctx.font = `800 ${titleFontSize}px Inter, system-ui, Arial`;
            ctx.fillStyle = headerTextColor;
            ctx.shadowColor = headerShadowColor;
            ctx.shadowBlur = headerShadowBlur;
            ctx.textBaseline = 'top';
            ctx.fillText(routeTitle, headerLeft, titleAreaY);
            ctx.shadowBlur = 0;
          }

          // Make the ride type smaller than title but still prominent
          rideTypeFontSize = Math.round(titleFontSize * 0.78); // ~37px if title is 48px
          headerLineGap = 8; // uniform gap between header lines
          ctx.font = `700 ${rideTypeFontSize}px Inter, system-ui, Arial`;
          ctx.fillStyle = headerTextColor;
          ctx.textBaseline = 'top';
          ctx.shadowColor = headerShadowColor;
          ctx.shadowBlur = headerShadowBlur;
          const rtX = headerLeft;
          const rtY = titleAreaY + titleFontSize + headerLineGap;
          ctx.fillText(rideTypeText, rtX, rtY);
          // measure ride type height to position locations reliably
          const rtMetrics = ctx.measureText(rideTypeText);
          rtHeight = ((rtMetrics.actualBoundingBoxAscent || 0) + (rtMetrics.actualBoundingBoxDescent || 0)) || rideTypeFontSize;
          ctx.shadowBlur = 0;
        } catch (e) {}

        // header shows only the ride type (weather/time moved to stats)
        
        if (startLocation && endLocation) {
          // place the location line below the ride-type label, aligned with headerLeft
          const rtY = titleAreaY + titleFontSize + headerLineGap; // same rtY used earlier for ride-type
          const locTextTopY = rtY + rideTypeFontSize + headerLineGap; // top-aligned under ride-type using font size and uniform gap
          ctx.font = `600 ${locationFontSize}px Inter, system-ui, Arial`;
          ctx.textBaseline = 'top';
          const locCenterY = locTextTopY + locationFontSize / 2;

          ctx.shadowColor = headerShadowColor;
          ctx.shadowBlur = headerShadowBlur;

          // align location container with title/ride-type left edge (headerLeft)
          const locDotRadius = 5;
          const dotOffsetY = locCenterY;
          
          // start dot positioned at headerLeft + radius (so left edge starts at headerLeft)
          const startDotX = headerLeft + locDotRadius;
          ctx.fillStyle = '#34D399';
          ctx.beginPath();
          ctx.arc(startDotX, dotOffsetY, locDotRadius, 0, Math.PI * 2);
          ctx.fill();

          // start location text after dot with small gap
          const startTextX = startDotX + locDotRadius + 8;
          ctx.font = `600 ${locationFontSize}px Inter, system-ui, Arial`;
          ctx.fillStyle = headerTextColor;
          ctx.textBaseline = 'top';
          ctx.fillText(startLocation, startTextX, locTextTopY);

          // arrow between locations (orange)
          const startWidth = ctx.measureText(startLocation).width;
          const arrowX = startTextX + startWidth + 12;
          ctx.fillStyle = headerTextColor;
          ctx.textBaseline = 'middle';
          ctx.fillText('→', arrowX, locCenterY);

          const arrowWidth = ctx.measureText('→').width;
          const endDotX = arrowX + arrowWidth + 12;

          // end location dot
          ctx.fillStyle = '#EF4444';
          ctx.beginPath();
          ctx.arc(endDotX, dotOffsetY, locDotRadius, 0, Math.PI * 2);
          ctx.fill();

          // end location text after dot
          const endTextX = endDotX + locDotRadius + 8;
          ctx.textBaseline = 'top';
          ctx.fillStyle = headerTextColor;
          ctx.fillText(endLocation, endTextX, locTextTopY);
          ctx.shadowBlur = 0;
        }
      }

      // (Removed top-right pill) — ride type badge will be shown in stats area to avoid overlapping photo

      // draw stylized polyline centered inside map area
      const coords = extractCoords(ride.polylineGeoJSON);
      // curve metric removed (user requested); keep placeholder for compatibility
      if (coords.length > 0) {
        let minX = coords[0][0], maxX = coords[0][0], minY = coords[0][1], maxY = coords[0][1];
        coords.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });
        const pad = 28;
        const w = mapW - pad * 2;
        const h = mapH - pad * 2;
        const worldW = maxX - minX || 1;
        const worldH = maxY - minY || 1;
        const scale = Math.min(w / worldW, h / worldH);
        
        // Calculate centered offsets
        const scaledW = worldW * scale;
        const scaledH = worldH * scale;
        const offsetX = (w - scaledW) / 2;
        const offsetY = (h - scaledH) / 2;
        
        const toCanvas = (lon: number, lat: number) => {
          const x = mapX + pad + offsetX + (lon - minX) * scale;
          const y = mapY + mapH - pad - offsetY - (lat - minY) * scale;
          return [x, y];
        };

        // Filter out very-close consecutive points (reduce GPS jitter)
        const toRadLocal = (d: number) => d * Math.PI / 180;
        const haversineRawLocal = (p1: [number, number], p2: [number, number]) => {
          const R = 6371000;
          const dLat = toRadLocal(p2[1] - p1[1]);
          const dLon = toRadLocal(p2[0] - p1[0]);
          const lat1 = toRadLocal(p1[1]);
          const lat2 = toRadLocal(p2[1]);
          const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
          return 2 * R * Math.asin(Math.sqrt(a));
        };
        const MIN_PT_DIST_M = 3;
        const filteredPts: [number, number][] = [];
        for (let i = 0; i < coords.length; i++) {
          if (filteredPts.length === 0) filteredPts.push(coords[i]);
          else {
            const last = filteredPts[filteredPts.length - 1];
            const d = haversineRawLocal(last as [number, number], coords[i] as [number, number]);
            if (d >= MIN_PT_DIST_M) filteredPts.push(coords[i]);
          }
        }
        const pts = filteredPts.length >= 2 ? filteredPts : coords;

        // stronger shadow beneath the route for contrast (kept subtle)
        ctx.lineWidth = 18;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineCap = 'round';
        ctx.beginPath();
        pts.forEach((c, idx) => {
          const [x, y] = toCanvas(c[0], c[1]);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // main gradient track (thicker and more visible)
        ctx.lineWidth = 10;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const trackGrad = ctx.createLinearGradient(mapX, 0, mapX + mapW, 0);
        trackGrad.addColorStop(0, '#FF6B35');
        trackGrad.addColorStop(1, '#FFB58A');
        ctx.strokeStyle = trackGrad;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        pts.forEach((c, idx) => {
          const [x, y] = toCanvas(c[0], c[1]);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;

        // curve metric removed per user request

        // start + end markers with white halo for visibility
        const s = toCanvas(pts[0][0], pts[0][1]);
        const e = toCanvas(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        // white halo
        ctx.beginPath(); ctx.arc(s[0], s[1], 11, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
        ctx.beginPath(); ctx.arc(e[0], e[1], 11, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
        // inner colored
        ctx.beginPath(); ctx.arc(s[0], s[1], 7, 0, Math.PI * 2); ctx.fillStyle = '#34D399'; ctx.fill();
        ctx.beginPath(); ctx.arc(e[0], e[1], 7, 0, Math.PI * 2); ctx.fillStyle = '#EF4444'; ctx.fill();
      } else {
        // placeholder small map tiles-like pattern
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(mapX + 12, mapY + 12, mapW - 24, mapH - 24);
      }

      // professional stats layout: vertically stacked at bottom with large white text
      const statSpacing = statsAreaH / 4;
      
      const avgSpeedKmh = ride.durationSeconds > 0 
        ? ((ride.distanceMeters / 1000) / (ride.durationSeconds / 3600)).toFixed(1)
        : '-';
      
      // curve removed

      const dateTimeVal = (() => {
        try {
          const d = new Date();
          const date = d.toLocaleDateString();
          const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `${date} ${time}`;
        } catch (e) {
          return '-';
        }
      })();
      const stats = [
        { label: 'Distance', value: (ride.distanceMeters / 1000).toFixed(2), unit: 'km' },
        { label: 'Duration', value: (() => {
          const s = ride.durationSeconds;
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const ss = Math.floor(s % 60);
          return h > 0 ? `${h}h ${m}m` : (m > 0 ? `${m}m ${ss}s` : `${ss}s`);
        })(), unit: '' },
        { label: 'Avg Speed', value: avgSpeedKmh, unit: 'km/h' },
        { label: 'Max Speed', value: `${ride.maxSpeedMs ? (ride.maxSpeedMs * 3.6).toFixed(1) : '-'}`, unit: 'km/h' },
        // show elevation (sea level / gain) if available
        { label: 'Elevation', value: ride.elevationGainMeters != null ? Math.round(ride.elevationGainMeters).toString() : '-', unit: 'm' },
        // place Date and Weather on the last row
        { label: 'Date', value: dateTimeVal || '-', unit: '' },
        { label: 'Weather', value: weatherText || '-', unit: '' }
      ];
      // ride type already included in the small tag row above the title; no separate badge drawn
      
      // Responsive stats layout: primary row (Distance + Duration) side-by-side, others stacked below
      try {
        const paddingX = 24;
        const availableW = mapW - paddingX * 2;

        // split out primary (Distance, Duration) and the rest
        const primaryLabels = ['Distance', 'Duration'];
        const primaryStats = stats.filter(s => primaryLabels.includes(s.label));
        const otherStats = stats.filter(s => !primaryLabels.includes(s.label));

        // Primary stats stacked (single column)
        const primaryStartY = statsAreaY;
        const primarySpacing = 140; // increased spacing between primary stats
        primaryStats.forEach((st, idx) => {
          const statX = mapX + paddingX;
          const statY = primaryStartY + idx * primarySpacing;

          // value (primary large)
          ctx.font = '900 92px Inter, system-ui, Arial';
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'top';
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 22;
          ctx.fillText(st.value, statX, statY);
          ctx.shadowBlur = 0;

          // unit
          if (st.unit) {
            const valueW = ctx.measureText(st.value).width;
            ctx.font = '700 28px Inter, system-ui, Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.86)';
            ctx.fillText(st.unit, statX + valueW + 12, statY + 8);
          }

          // label
          ctx.font = '700 28px Inter, system-ui, Arial';
          ctx.fillStyle = 'rgba(255,255,255,0.82)';
          ctx.fillText(st.label, statX, statY + 100);
        });

        // Other stats: stacked below primary row
        let otherY = statsAreaY + primaryStats.length * primarySpacing + 32; // start below primary row
        const otherX = mapX + paddingX;
        const secondaryFontSize = 42; // uniform font size for all secondary stats
        
        for (let i = 0; i < otherStats.length; i++) {
          const st = otherStats[i];
          const isWeather = st.label === 'Weather';

          // All secondary stats use uniform appearance (no special cases)
          ctx.font = `700 ${secondaryFontSize}px Inter, system-ui, Arial`;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.textBaseline = 'top';
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 12;
          
          if (isWeather && weatherIcon) {
            // draw icon using consistent proportion
            const iconSize = Math.floor(secondaryFontSize * 0.5); // 21px
            ctx.font = `700 ${iconSize}px Inter, system-ui, Arial`;
            ctx.fillText(weatherIcon, otherX, otherY + 4);
            const iconW = ctx.measureText(weatherIcon).width;
            ctx.font = `700 ${secondaryFontSize}px Inter, system-ui, Arial`;
            ctx.fillText(st.value, otherX + iconW + 10, otherY);
          } else {
            ctx.fillText(st.value, otherX, otherY);
          }
          ctx.shadowBlur = 0;

          // unit (uniform for all secondary stats)
          if (st.unit) {
            const vW = (isWeather && weatherIcon) 
              ? ctx.measureText(st.value).width + ctx.measureText(weatherIcon).width + 10 
              : ctx.measureText(st.value).width;
            ctx.font = '700 18px Inter, system-ui, Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.76)';
            ctx.fillText(st.unit, otherX + vW + 12, otherY + 12);
          }

          // label (closer to value like primary stats)
          ctx.font = '600 18px Inter, system-ui, Arial';
          ctx.fillStyle = 'rgba(255,255,255,0.74)';
          ctx.fillText(st.label, otherX, otherY + 50);
          
          // reduced spacing increment for tighter layout
          otherY += 96;
        }
      } catch (e) {
        // fallback: try simple stacked drawing
        stats.forEach((stat, i) => {
          const statY = statsAreaY + i * statSpacing;
          const statX = mapX + 24;
          ctx.font = '900 48px Inter, system-ui, Arial';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(stat.value, statX, statY);
          ctx.font = '700 20px Inter, system-ui, Arial';
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(stat.label, statX, statY + 56);
        });
      }

      // prefer Blob + object URL for more reliable downloads
      // apply final overlay (single configured overlay) across the whole canvas if enabled
      if (overlayEnabled && overlayColor) {
        const r = parseInt(overlayColor.slice(1,3),16);
        const g = parseInt(overlayColor.slice(3,5),16);
        const b = parseInt(overlayColor.slice(5,7),16);
        ctx.save();
        ctx.fillStyle = `rgba(${r},${g},${b},${OVERLAY_OPACITY})`;
        ctx.fillRect(0, 0, outW, outH);
        ctx.restore();
      }

      await new Promise<void>((res, rej) => {
        out.toBlob((blob) => {
          if (!blob) return rej(new Error('Failed to create blob'));
          try {
            const url = URL.createObjectURL(blob);
            // revoke previous
            setPngUrl((prev) => {
              if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
              return url;
            });
            res();
          } catch (e) { rej(e); }
        }, 'image/png');
      });
    } catch (err) {
      console.error('Failed to generate share image', err);
    } finally {
      setGenerating(false);
    }
  }

  async function download() {
    if (!pngUrl) return;
    console.log('Download clicked, pngUrl:', pngUrl);
    try {
      // Fetch the blob
      const resp = await fetch(pngUrl);
      const blob = await resp.blob();
      
      // If running in native (Capacitor) environment
      if (Capacitor.getPlatform && Capacitor.getPlatform() !== 'web') {
        console.log('Native platform detected, writing to filesystem');
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // convert to base64 in chunks
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const slice = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(slice) as any);
        }
        const base64 = btoa(binary);
        const fileName = `ride_${ride.id}_${Date.now()}.png`;
        
        // Try to write to Downloads folder (public directory)
        try {
          const result = await Filesystem.writeFile({ 
            path: fileName, 
            data: base64, 
            directory: Directory.Documents,
            recursive: true
          });
          console.log('File written:', result);
          
          // Get the URI to verify
          const uri = await Filesystem.getUri({ 
            directory: Directory.Documents, 
            path: fileName 
          });
          console.log('File URI:', uri.uri);
          alert(`Image saved successfully!\nFile: ${fileName}`);
        } catch (fsError) {
          console.error('Filesystem error:', fsError);
          // Fallback to share if write fails
          alert('Could not save to Downloads. Opening share dialog...');
          await share();
        }
        return;
      }

      // Web fallback: fetch blob and trigger anchor download
      console.log('Web platform, using anchor download');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ride-${ride.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      console.log('Download triggered');
    } catch (e) {
      console.error('Download error:', e);
      // fallback: open in new tab
      window.open(pngUrl, '_blank');
    }
  }

  async function share() {
    if (!pngUrl) return;
    try {
      if (Capacitor.getPlatform && Capacitor.getPlatform() !== 'web') {
        const resp = await fetch(pngUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const slice = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(slice) as any);
        }
        const base64 = btoa(binary);
        const fileName = `ride-${ride.id}.png`;
        await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Data });
        const uri = await Filesystem.getUri({ directory: Directory.Data, path: fileName });
        await Share.share({ title: 'Ride image', url: uri.uri });
        return;
      }
      // web fallback: open image in new tab for user to share manually
      window.open(pngUrl, '_blank');
    } catch (e) {
      console.warn('Share failed', e);
      window.open(pngUrl, '_blank');
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setBgImageUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', 
      gap: 20, 
      padding: '0 4px'
    }}>
      {/* Left Column - Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Route Details Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.03)', 
          borderRadius: 12, 
          padding: 16,
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <h3 style={{ 
            margin: '0 0 12px 0', 
            fontSize: 16, 
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)'
          }}>Route Details</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: 12, 
                color: 'rgba(255,255,255,0.6)', 
                marginBottom: 6,
                fontWeight: 500
              }}>Title</label>
              <input 
                type="text" 
                placeholder="e.g., Morning Ride" 
                value={routeTitle} 
                onChange={(e) => setRouteTitle(e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '10px 12px', 
                  borderRadius: 8, 
                  border: '1px solid rgba(255,255,255,0.12)', 
                  background: 'rgba(255,255,255,0.05)', 
                  color: '#fff', 
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(255,107,53,0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 12, 
                  color: 'rgba(255,255,255,0.6)', 
                  marginBottom: 6,
                  fontWeight: 500
                }}>From</label>
                <input 
                  type="text" 
                  placeholder="Start location" 
                  value={startLocation} 
                  onChange={(e) => setStartLocation(e.target.value)}
                  style={{ 
                    width: '100%',
                    padding: '10px 12px', 
                    borderRadius: 8, 
                    border: '1px solid rgba(255,255,255,0.12)', 
                    background: 'rgba(255,255,255,0.05)', 
                    color: '#fff', 
                    fontSize: 14,
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(52,211,153,0.5)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                />
              </div>
              
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: 12, 
                  color: 'rgba(255,255,255,0.6)', 
                  marginBottom: 6,
                  fontWeight: 500
                }}>To</label>
                <input 
                  type="text" 
                  placeholder="End location" 
                  value={endLocation} 
                  onChange={(e) => setEndLocation(e.target.value)}
                  style={{ 
                    width: '100%',
                    padding: '10px 12px', 
                    borderRadius: 8, 
                    border: '1px solid rgba(255,255,255,0.12)', 
                    background: 'rgba(255,255,255,0.05)', 
                    color: '#fff', 
                    fontSize: 14,
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(251,113,133,0.5)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontWeight: 500 }}>Weather</label>
                <select value={weatherMode} onChange={(e) => setWeatherMode(e.target.value as any)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: '#fff' }}>
                  <option value="auto">Auto (current)</option>
                  <option value="manual">Manual</option>
                  <option value="none">None</option>
                </select>
                {geoPermissionDenied && weatherMode === 'auto' && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.54)', marginTop: 8 }}>
                    Geolocation denied — using ride start location for weather
                  </div>
                )}
              </div>
              {weatherMode === 'manual' && (
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontWeight: 500 }}>Manual weather</label>
                  <input value={manualWeather} onChange={(e) => setManualWeather(e.target.value)} placeholder="e.g., Clear 24°C" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: '#fff' }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Background Image Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.03)', 
          borderRadius: 12, 
          padding: 16,
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <h3 style={{ 
            margin: '0 0 12px 0', 
            fontSize: 16, 
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)'
          }}>Background Image</h3>
          
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{ 
              width: '100%',
              padding: '12px', 
              borderRadius: 8, 
              border: '2px dashed rgba(255,255,255,0.2)', 
              background: 'rgba(255,255,255,0.02)', 
              color: 'rgba(255,255,255,0.7)', 
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: 12
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,107,53,0.5)';
              e.currentTarget.style.background = 'rgba(255,107,53,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
            }}
          >
            📁 Choose from Gallery
          </button>
          
          {ride.photoUrls && ride.photoUrls.length > 0 && (
            <>
              <div style={{ 
                fontSize: 12, 
                color: 'rgba(255,255,255,0.5)', 
                marginBottom: 8,
                fontWeight: 500
              }}>Or select from ride photos:</div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', 
                gap: 8
              }}>
                {ride.photoUrls.map((p, idx) => (
                  <div 
                    key={p + idx} 
                    onClick={() => setBgImageUrl(bgImageUrl === p ? null : p)}
                    style={{ 
                      position: 'relative', 
                      paddingBottom: '100%',
                      cursor: 'pointer',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: bgImageUrl === p ? '3px solid #FF6B35' : '2px solid rgba(255,255,255,0.1)',
                      transition: 'all 0.2s',
                      boxShadow: bgImageUrl === p ? '0 4px 12px rgba(255,107,53,0.3)' : 'none'
                    }}
                  >
                    <img 
                      src={p} 
                      alt={`Photo ${idx + 1}`}
                      style={{ 
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover'
                      }} 
                    />
                    {bgImageUrl === p && (
                      <div style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#FF6B35',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 'bold'
                      }}>✓</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          
          {bgImageUrl && (
            <button 
              onClick={() => setBgImageUrl(null)}
              style={{ 
                width: '100%',
                marginTop: 12,
                padding: '8px', 
                borderRadius: 6, 
                border: '1px solid rgba(255,255,255,0.1)', 
                background: 'rgba(255,255,255,0.05)', 
                color: 'rgba(255,255,255,0.6)', 
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Clear Background
            </button>
          )}
        </div>

        {/* Style Options Section */}
        <div style={{ 
          background: 'rgba(255,255,255,0.03)', 
          borderRadius: 12, 
          padding: 16,
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <h3 style={{ 
            margin: '0 0 12px 0', 
            fontSize: 16, 
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)'
          }}>Style Options</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10,
              cursor: 'pointer',
              padding: '8px 0'
            }}>
              <input 
                type="checkbox" 
                checked={overlayEnabled} 
                onChange={(e) => setOverlayEnabled(e.target.checked)}
                style={{ 
                  width: 18, 
                  height: 18, 
                  cursor: 'pointer',
                  accentColor: '#FF6B35'
                }}
              />
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                Apply color overlay
              </span>
            </label>
            
            {overlayEnabled && (
              <div style={{ paddingLeft: 28 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 10
                }}>
                  <input 
                    type="color" 
                    value={overlayColor} 
                    onChange={(e) => setOverlayColor(e.target.value)}
                    style={{ 
                      width: 40, 
                      height: 40, 
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: 'transparent'
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    Overlay color
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button 
            className="rh-generate-btn" 
            onClick={generate} 
            disabled={generating}
            style={{ 
              width: '100%',
              padding: '14px',
              fontSize: 16,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #FF6B35 0%, #FF8A5A 100%)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              cursor: generating ? 'not-allowed' : 'pointer',
              opacity: generating ? 0.6 : 1,
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(255,107,53,0.3)'
            }}
          >
            {generating ? '⏳ Generating…' : '✨ Generate Image'}
          </button>
          
          {pngUrl && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button 
                className="rh-generate-btn" 
                onClick={download}
                style={{ 
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'rgba(52,211,153,0.15)',
                  border: '1px solid rgba(52,211,153,0.3)',
                  borderRadius: 8,
                  color: '#34D399',
                  cursor: 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                💾 Download
              </button>
              <button 
                className="rh-generate-btn" 
                onClick={share}
                style={{ 
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'rgba(96,165,250,0.15)',
                  border: '1px solid rgba(96,165,250,0.3)',
                  borderRadius: 8,
                  color: '#60A5FA',
                  cursor: 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                📤 Share
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Preview */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        position: 'sticky',
        top: 20,
        height: 'fit-content'
      }}>
        {pngUrl ? (
          <div style={{ 
            background: 'rgba(255,255,255,0.03)', 
            borderRadius: 12, 
            padding: 16,
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <h3 style={{ 
              margin: '0 0 12px 0', 
              fontSize: 16, 
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)'
            }}>Preview</h3>
            <img 
              src={pngUrl} 
              alt="share preview" 
              style={{ 
                width: '100%', 
                borderRadius: 0, 
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                display: 'block'
              }} 
            />
          </div>
        ) : (
          <div style={{ 
            background: 'rgba(255,255,255,0.03)', 
            borderRadius: 12, 
            padding: 40,
            border: '2px dashed rgba(255,255,255,0.1)',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.4)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🖼️</div>
            <div style={{ fontSize: 14 }}>
              Click "Generate Image" to see your<br />customized share image here
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

