import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

type Props = {
  isOpen: boolean;
  onDidDismiss: () => void;
  centered?: boolean;
  children?: React.ReactNode;
};

const BottomSheet: React.FC<Props> = ({ isOpen, onDidDismiss, centered = false, children }) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const [translateY, setTranslateY] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDidDismiss();
    };
    if (isOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onDidDismiss]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
    return;
  }, [isOpen]);

  useEffect(() => {
    setTranslateY(0);
  }, [isOpen]);

  const onPointerDown = (ev: React.PointerEvent) => {
    startYRef.current = ev.clientY;
    draggingRef.current = true;
    (ev.target as Element).setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (!draggingRef.current || startYRef.current == null) return;
    const delta = Math.max(0, ev.clientY - startYRef.current);
    setTranslateY(delta);
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const delta = translateY;
    const threshold = (sheetRef.current?.clientHeight || 300) * 0.28; // 28% of sheet height
    if (delta > 120 || delta > threshold) {
      onDidDismiss();
    } else {
      // animate back
      setTranslateY(0);
    }
  };

  if (!isOpen) return null;

  const sheetStyle: React.CSSProperties = {
    transform: `translateY(${translateY}px)`,
    transition: draggingRef.current ? 'none' : 'transform 220ms cubic-bezier(0.22, 0.9, 0.36, 1)'
  };

  return ReactDOM.createPortal(
    <div className={`custom-sheet-backdrop${centered ? ' centered-backdrop' : ''}`}>
      <div
        ref={sheetRef}
        data-centered={centered ? 'true' : 'false'}
        className={`custom-sheet${centered ? ' centered' : ''}${draggingRef.current ? ' dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
        {...(!centered ? { onPointerDown, onPointerMove, onPointerUp } : {})}
      >
        {!centered && <div className="sheet-handle" aria-hidden />}
        <div className="sheet-inner">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default BottomSheet;
