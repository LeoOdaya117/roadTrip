import React, { useState } from 'react';

interface Slide {
  title: string;
  subtitle: string;
  // svgContent or anything renderable
  render: () => JSX.Element;
}

export default function Onboarding({ compact }: { compact?: boolean } = {}) {
  const slides: Slide[] = [
    {
      title: 'Plan routes together',
      subtitle: 'Create and share routes with your riding group.',
      render: () => (
        <svg width="220" height="120" viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="220" height="120" rx="12" fill="#fff" opacity="0.06" />
          <g transform="translate(18,12)">
            <path d="M10 80 C40 40, 90 40, 120 80" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9" />
            <circle cx="18" cy="68" r="10" fill="#fff" />
            <circle cx="114" cy="68" r="10" fill="#fff" />
          </g>
        </svg>
      ),
    },
    {
      title: 'Share photos & chat',
      subtitle: 'Upload photos on the go and chat with friends.',
      render: () => (
        <svg width="220" height="120" viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="220" height="120" rx="12" fill="#fff" opacity="0.06" />
          <g transform="translate(24,18)">
            <rect x="8" y="10" width="120" height="68" rx="8" stroke="#fff" strokeWidth="2" opacity="0.9" fill="none" />
            <circle cx="96" cy="18" r="8" fill="#fff" />
            <path d="M12 62 L40 32 L72 60 L104 30" stroke="#fff" strokeWidth="2" fill="none" />
          </g>
        </svg>
      ),
    },
    {
      title: 'Keep a riding diary',
      subtitle: 'Remember your best rides and moments together.',
      render: () => (
        <svg width="220" height="120" viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="220" height="120" rx="12" fill="#fff" opacity="0.06" />
          <g transform="translate(18,14)">
            <rect x="6" y="8" width="140" height="92" rx="8" fill="none" stroke="#fff" strokeWidth="2" opacity="0.9" />
            <path d="M18 30 H118" stroke="#fff" strokeWidth="2" />
            <path d="M18 48 H118" stroke="#fff" strokeWidth="2" />
            <path d="M18 66 H80" stroke="#fff" strokeWidth="2" />
          </g>
        </svg>
      ),
    },
  ];

  const [idx, setIdx] = useState(0);

  const next = () => setIdx((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setIdx((i) => Math.max(i - 1, 0));
  const skip = () => setIdx(slides.length - 1);

  if (compact) {
    return (
      <div className="onboarding compact">
        <div className="onboarding-visual">{slides[idx].render()}</div>
        <div className="dots" style={{ marginTop: 8 }}>
          {slides.map((_, i) => (
            <span key={i} className={`dot ${i === idx ? 'active' : ''}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <div className="onboarding-visual">{slides[idx].render()}</div>
      <div className="onboarding-text">
        <h3>{slides[idx].title}</h3>
        <p>{slides[idx].subtitle}</p>
      </div>

      <div className="onboarding-controls">
        <div className="dots">
          {slides.map((_, i) => (
            <span key={i} className={`dot ${i === idx ? 'active' : ''}`} />
          ))}
        </div>
        <div className="buttons">
          {idx < slides.length - 1 ? (
            <button type="button" className="btn-link" onClick={skip}>Skip</button>
          ) : null}
          {idx < slides.length - 1 ? (
            <button type="button" className="btn-primary" onClick={next}>Next</button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setIdx(0)}>Restart</button>
          )}
        </div>
      </div>
    </div>
  );
}
