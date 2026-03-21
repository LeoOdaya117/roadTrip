import React from 'react';

const HeroIllustration: React.FC = () => {
  return (
    <svg width="100%" height="100" viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ff9a3c"/>
          <stop offset="1" stopColor="#ff5e62"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="140" height="100" rx="12" fill="url(#g1)" />
      <g transform="translate(28,18)">
        <circle cx="18" cy="52" r="16" fill="#fff" opacity="0.15" />
        <circle cx="74" cy="52" r="16" fill="#fff" opacity="0.15" />
        <path d="M12 52 L30 30 L52 34 L70 18" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="34" cy="28" r="6" fill="#fee" />
        <path d="M36 26 C40 22,50 22,54 26" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
};

export default HeroIllustration;
