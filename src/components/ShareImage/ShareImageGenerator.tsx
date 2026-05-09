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
  const [routeTitle, setRouteTitle] = useState('');
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // fixed constants (single configured setting)
  const CARD_ALPHA = 0.62;
  const SHADOW_BLUR = 28;
  const OVERLAY_OPACITY = 0.22;

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
      const bottomPadding = 60;
      const sectionGap = 50;  // gap between title/map/stats
      const mapPad = 48;
      
      // Title and locations area
      const titleAreaY = topPadding;
      const titleFontSize = 56;
      const locationFontSize = 30;
      const titleHeight = titleFontSize + 20;  // title + spacing below
      const locationHeight = locationFontSize + 10;
      const titleAreaHeight = titleHeight + locationHeight;
      
      // Map area
      const mapY = titleAreaY + titleAreaHeight + sectionGap;
      const mapX = mapPad;
      const mapW = outW - mapPad * 2;
      const mapH = 700;  // fixed height for map
      
      // Stats area
      const statsAreaY = mapY + mapH + sectionGap;
      const statsAreaH = outH - statsAreaY - bottomPadding;
      
      const radius = 20;

      // route title and locations at top (if provided)
      if (routeTitle || startLocation || endLocation) {
        ctx.textBaseline = 'top';
        
        if (routeTitle) {
          ctx.font = `800 ${titleFontSize}px Inter, system-ui, Arial`;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur = 16;
          ctx.fillText(routeTitle, mapX + 24, titleAreaY);
          ctx.shadowBlur = 0;
        }
        
        if (startLocation && endLocation) {
          const locTextY = titleAreaY + titleHeight;
          ctx.font = `600 ${locationFontSize}px Inter, system-ui, Arial`;
          ctx.textBaseline = 'middle';  // use middle for better dot alignment
          const locCenterY = locTextY + locationFontSize / 2;
          
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 12;
          
          // start location with green dot (centered with text)
          ctx.fillStyle = '#34D399';
          ctx.beginPath();
          ctx.arc(mapX + 24, locCenterY, 8, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillText(startLocation, mapX + 44, locCenterY);
          
          // end location with red dot
          const startWidth = ctx.measureText(startLocation).width;
          const arrowX = mapX + 44 + startWidth + 24;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillText('→', arrowX, locCenterY);
          
          const arrowWidth = ctx.measureText('→').width;
          const endX = arrowX + arrowWidth + 24;
          ctx.fillStyle = '#EF4444';
          ctx.beginPath();
          ctx.arc(endX, locCenterY, 8, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillText(endLocation, endX + 20, locCenterY);
          ctx.shadowBlur = 0;
        }
      }

      // draw stylized polyline centered inside map area
      const coords = extractCoords(ride.polylineGeoJSON);
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

        // shadow
        ctx.lineWidth = 16;
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        coords.forEach((c, idx) => {
          const [x, y] = toCanvas(c[0], c[1]);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // main gradient track
        ctx.lineWidth = 8;
        const trackGrad = ctx.createLinearGradient(mapX, 0, mapX + mapW, 0);
        trackGrad.addColorStop(0, '#FF6B35');
        trackGrad.addColorStop(1, '#FFB58A');
        ctx.strokeStyle = trackGrad;
        ctx.beginPath();
        coords.forEach((c, idx) => {
          const [x, y] = toCanvas(c[0], c[1]);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // start + end markers
        const s = toCanvas(coords[0][0], coords[0][1]);
        const e = toCanvas(coords[coords.length - 1][0], coords[coords.length - 1][1]);
        ctx.fillStyle = '#34D399'; ctx.beginPath(); ctx.arc(s[0], s[1], 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(e[0], e[1], 8, 0, Math.PI * 2); ctx.fill();
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
        { label: 'Max Speed', value: `${ride.maxSpeedMs ? (ride.maxSpeedMs * 3.6).toFixed(1) : '-'}`, unit: 'km/h' }
      ];
      
      stats.forEach((stat, i) => {
        const statY = statsAreaY + i * statSpacing;
        const statX = mapX + 24;
        
        // large white value text
        ctx.font = '900 72px Inter, system-ui, Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 18;
        ctx.fillText(stat.value, statX, statY);
        ctx.shadowBlur = 0;
        
        // unit text (smaller, same line)
        if (stat.unit) {
          const valueWidth = ctx.measureText(stat.value).width;
          ctx.font = '700 32px Inter, system-ui, Arial';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(stat.unit, statX + valueWidth + 12, statY + 12);
        }
        
        // label below value (increased size for readability)
        ctx.font = '700 28px Inter, system-ui, Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(stat.label, statX, statY + 82);
      });

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
                borderRadius: 8, 
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

