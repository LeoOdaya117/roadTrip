import React from 'react';

type Props = { photoUrls: string[] };

export default function GalleryGrid({ photoUrls }: Props) {
  if (!photoUrls || photoUrls.length === 0) {
    return <div style={{ padding: 12, color: '#666' }}>No photos for this ride.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {photoUrls.map((url, i) => (
        <div key={i} style={{ borderRadius: 6, overflow: 'hidden' }}>
          <img
            src={url}
            alt={`ride photo ${i + 1}`}
            style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
            loading="lazy"
            onClick={() => window.open(url, '_blank')}
          />
        </div>
      ))}
    </div>
  );
}
