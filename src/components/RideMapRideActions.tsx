import { IonIcon } from '@ionic/react';
import { pause, play, stopCircle } from 'ionicons/icons';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

type Props = {
  isTracking: boolean;
  busy: boolean;
  transition: 'pausing' | 'resuming' | null;
  onToggleTracking: () => void;
  onEndRide: () => void;
};

const RideMapRideActions: React.FC<Props> = ({ isTracking, busy, transition, onToggleTracking, onEndRide }) => {
  const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const endButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const didOpenConfirmationRef = useRef(false);

  useEffect(() => {
    if (isConfirmingEnd) {
      didOpenConfirmationRef.current = true;
      const appRoot = document.getElementById('root');
      const wasInert = appRoot?.inert ?? false;
      if (appRoot) {
        appRoot.inert = true;
        appRoot.setAttribute('inert', '');
      }
      cancelButtonRef.current?.focus();
      return () => {
        if (appRoot) {
          appRoot.inert = wasInert;
          if (!wasInert) appRoot.removeAttribute('inert');
        }
      };
    } else if (didOpenConfirmationRef.current) {
      endButtonRef.current?.focus({ preventScroll: true });
    }
  }, [isConfirmingEnd]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsConfirmingEnd(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirmEndRide = () => {
    setIsConfirmingEnd(false);
    onEndRide();
  };
  const trackingActionLabel = busy
    ? transition === 'pausing'
      ? 'Pausing ride tracking'
      : transition === 'resuming'
        ? 'Resuming ride tracking'
        : 'Updating ride tracking'
    : isTracking
      ? 'Pause ride tracking'
      : 'Resume ride tracking';
  const trackingActionText = busy
    ? transition === 'pausing'
      ? 'Pausing…'
      : transition === 'resuming'
        ? 'Resuming…'
        : 'Updating…'
    : isTracking
      ? 'Pause ride'
      : 'Resume ride';
  const endRideConfirmation = isConfirmingEnd && typeof document !== 'undefined'
    ? createPortal(
      <div className="ride-end-confirmation-backdrop" data-ride-end-confirmation-backdrop>
        <div
          className="ride-end-confirmation"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ride-end-title"
          aria-describedby="ride-end-description"
          ref={dialogRef}
          onKeyDown={handleDialogKeyDown}
          data-ride-end-confirmation
        >
          <div className="ride-end-confirmation-copy">
            <h2 id="ride-end-title">End this ride?</h2>
            <p id="ride-end-description">Your ride will be saved to history and tracking will stop.</p>
          </div>
          <div className="ride-end-confirmation-actions">
            <button type="button" ref={cancelButtonRef} onClick={() => setIsConfirmingEnd(false)} data-ride-end-cancel>
              Keep riding
            </button>
            <button type="button" aria-label="Confirm end ride" onClick={confirmEndRide} data-ride-end-confirm>
              End ride
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="ride-map-ride-actions">
      <div className="ride-action-bar" data-ride-actions="persistent" role="group" aria-label="Ride actions">
        <button
          type="button"
          className="ride-action-primary"
          onClick={onToggleTracking}
          disabled={busy}
          aria-label={trackingActionLabel}
          aria-busy={busy}
          data-ride-action="pause-resume"
        >
          <IonIcon icon={isTracking ? pause : play} aria-hidden="true" />
          <span>{trackingActionText}</span>
        </button>
        <button
          type="button"
          ref={endButtonRef}
          className="ride-action-end"
          onClick={() => setIsConfirmingEnd(true)}
          disabled={busy}
          aria-label="End ride"
          data-ride-action="end"
        >
          <IonIcon icon={stopCircle} aria-hidden="true" />
          <span>End ride</span>
        </button>
      </div>
      {endRideConfirmation}
    </div>
  );
};

export default RideMapRideActions;
