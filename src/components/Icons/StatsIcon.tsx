import React from 'react';

export default function StatsIcon({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="13" width="4" height="7" fill="#93C5FD" />
      <rect x="10" y="6" width="4" height="14" fill="#60A5FA" />
      <rect x="17" y="2" width="4" height="18" fill="#3B82F6" />
    </svg>
  );
}
