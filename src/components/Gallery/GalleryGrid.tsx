import React from 'react';

type Props = { photoUrls: string[] };

export default function GalleryGrid({ photoUrls }: Props) {
  if (!photoUrls || photoUrls.length === 0) {
    return <div style={{ padding: 12, color: '#666' }}>No photos for this ride.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {photoUrls.map((url, i) => (
        <div key={`${url}-${i}`} style={{ borderRadius: 6, overflow: 'hidden' }}>
          <button
            type="button"
            aria-label={`Open ride photo ${i + 1} in a new tab`}
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
          >
          <img
            src={url}
            alt={`Ride photo ${i + 1}`}
            style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
          </button>
        </div>
      ))}
    </div>
  );
}
