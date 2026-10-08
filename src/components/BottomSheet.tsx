import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

type Props = {
  isOpen: boolean;
  onDidDismiss: () => void;
  centered?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
};

const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const BottomSheet: React.FC<Props> = ({
  isOpen,
  onDidDismiss,
  centered = false,
  children,
  footer,
  ariaLabel = 'Sheet dialog',
}) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const dragDistanceRef = useRef(0);
  const dismissRef = useRef(onDidDismiss);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  dismissRef.current = onDidDismiss;

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusables = sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusables?.[0] ?? sheetRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;

      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  useEffect(() => {
    setTranslateY(0);
    setIsDragging(false);
    dragDistanceRef.current = 0;
  }, [isOpen]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    startYRef.current = event.clientY;
    dragDistanceRef.current = 0;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startYRef.current == null) return;
    const distance = Math.max(0, event.clientY - startYRef.current);
    dragDistanceRef.current = distance;
    setTranslateY(distance);
  };

  const onPointerUp = () => {
    if (startYRef.current == null) return;
    startYRef.current = null;
    setIsDragging(false);
    const threshold = (sheetRef.current?.clientHeight || 300) * 0.28;
    if (dragDistanceRef.current > Math.min(120, threshold)) {
      dismissRef.current();
    } else {
      setTranslateY(0);
    }
  };

  if (!isOpen) return null;

  const sheetStyle: React.CSSProperties = {
    transform: `translateY(${translateY}px)`,
    transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 0.9, 0.36, 1)',
  };

  return ReactDOM.createPortal(
    <div
      className={`custom-sheet-backdrop${centered ? ' centered-backdrop' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismissRef.current();
      }}
    >
      <div
        ref={sheetRef}
        data-centered={centered ? 'true' : 'false'}
        className={`custom-sheet${centered ? ' centered' : ''}${isDragging ? ' dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={sheetStyle}
      >
        {!centered && (
          <div
            className="sheet-handle"
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
        <div className="sheet-inner">{children}</div>
        {footer && <div className="custom-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

export default BottomSheet;
