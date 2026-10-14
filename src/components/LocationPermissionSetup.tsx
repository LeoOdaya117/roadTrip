import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import BottomSheet from './BottomSheet';
import {
  hasFinishedLocationPermissionSetup,
  isAndroidPermissionSetupSupported,
  LocationServicesDisabledError,
  PERMISSION_SETUP_REQUEST_EVENT,
  prepareLocationPermissions,
  saveLocationPermissionSetup,
} from '../services/locationPermissions';
import '../styles/location-permission-setup.css';

export default function LocationPermissionSetup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => isAndroidPermissionSetupSupported() && !hasFinishedLocationPermissionSetup());
  const [released, setReleased] = useState(() => !isAndroidPermissionSetupSupported() || hasFinishedLocationPermissionSetup());
  const [error, setError] = useState<{ message: string; locationDisabled: boolean } | null>(null);
  const mounted = useRef(false);
  const requestInProgress = useRef(false);
  const initialRequestNeeded = useRef(open);
  const initialRequestStarted = useRef(false);

  const prepare = useCallback(async () => {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    setError(null);
    setOpen(true);
    try {
      await prepareLocationPermissions();
      if (mounted.current) {
        saveLocationPermissionSetup('completed');
        setReleased(true);
        setOpen(false);
      }
    } catch (failure) {
      if (mounted.current) {
        setError({
          message: failure instanceof Error ? failure.message : 'Permission setup could not finish. Please retry or skip for now.',
          locationDisabled: failure instanceof LocationServicesDisabledError,
        });
      }
    } finally {
      requestInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const reopen = () => {
      if (!isAndroidPermissionSetupSupported() || requestInProgress.current) return;
      void prepare();
    };
    window.addEventListener(PERMISSION_SETUP_REQUEST_EVENT, reopen);
    if (initialRequestNeeded.current && !initialRequestStarted.current) {
      initialRequestStarted.current = true;
      void prepare();
    }
    return () => {
      mounted.current = false;
      window.removeEventListener(PERMISSION_SETUP_REQUEST_EVENT, reopen);
    };
  }, [prepare]);

  const skip = () => {
    if (requestInProgress.current) return;
    saveLocationPermissionSetup('skipped');
    setReleased(true);
    setOpen(false);
  };

  return (
    <>
      {released && children}
      <BottomSheet isOpen={open} centered ariaLabel="Ride permissions" onDidDismiss={() => {}}>
        <div className="location-permission-setup">
          {error ? (
            <>
              <p className="permission-setup-error" role="alert">{error.message}</p>
              <div className="permission-setup-actions">
                <button type="button" className="permission-setup-retry" onClick={() => { void prepare(); }}>
                  {error.locationDisabled ? 'Turn on location' : 'Retry'}
                </button>
                <button type="button" onClick={skip}>Skip for now</button>
              </div>
            </>
          ) : (
            <p role="status">Waiting for Android permissions…</p>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
