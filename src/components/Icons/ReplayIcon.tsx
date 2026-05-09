import React from 'react';

export default function ReplayIcon({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v7l5-4-5-3z" fill="#FF6B35" />
      <path d="M3.05 6.54A9.956 9.956 0 002 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-1.85-.48-3.59-1.32-5.12" stroke="#08101a" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
