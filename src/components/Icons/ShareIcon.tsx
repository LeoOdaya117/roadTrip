import React from 'react';

export default function ShareIcon({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" stroke="#93C5FD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3v13" stroke="#93C5FD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 8l5-5 5 5" stroke="#93C5FD" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
