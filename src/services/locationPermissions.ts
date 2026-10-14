import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { createLocationProviders } from './LocationProviderFactory';

export const PERMISSION_SETUP_KEY = 'roadtrip:permission-setup-v1';
export const PERMISSION_SETUP_REQUEST_EVENT = 'roadtrip:permission-setup-request';

let foregroundRequest: Promise<void> | null = null;
let setupRequest: Promise<void> | null = null;

interface AndroidLocationServicesPlugin {
  checkLocationServices(): Promise<{ enabled: boolean }>;
  openLocationSettings(): Promise<{ enabled: boolean }>;
}

const AndroidLocationServices = registerPlugin<AndroidLocationServicesPlugin>('AndroidBackgroundLocationPermission');

export class LocationServicesDisabledError extends Error {
  readonly code = 'LOCATION_SERVICES_DISABLED';

  constructor() {
    super('Location is turned off. Turn on location in Android Settings, then return to RoadTrip.');
    this.name = 'LocationServicesDisabledError';
  }
}

async function ensureAppIsActive(): Promise<void> {
  const state = await App.getState();
  if (!state.isActive) throw new Error('Open RoadTrip to finish location permission setup.');
}

async function ensureLocationServices(): Promise<void> {
  const status = await AndroidLocationServices.checkLocationServices();
  if (status.enabled) return;
  await ensureAppIsActive();
  try {
    await AndroidLocationServices.openLocationSettings();
  } catch {
    throw new LocationServicesDisabledError();
  }
  const updated = await AndroidLocationServices.checkLocationServices();
  if (!updated.enabled) throw new LocationServicesDisabledError();
}

export function isAndroidPermissionSetupSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Permission preparation only: never acquires a fix or starts a watch. */
export function ensureForegroundLocationPermission(): Promise<void> {
  if (!isAndroidPermissionSetupSupported()) return Promise.resolve();
  if (foregroundRequest) return foregroundRequest;
  foregroundRequest = (async () => {
    await ensureAppIsActive();
    await ensureLocationServices();
    await ensureAppIsActive();
    let status = await Geolocation.checkPermissions();
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      await ensureAppIsActive();
      status = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    }
    if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
      throw new Error('Location permission is needed to show your position and record rides. Allow location in Android Settings, then retry.');
    }
  })().finally(() => { foregroundRequest = null; });
  return foregroundRequest;
}

export function prepareLocationPermissions(): Promise<void> {
  if (!isAndroidPermissionSetupSupported()) return Promise.resolve();
  if (setupRequest) return setupRequest;
  setupRequest = (async () => {
    await ensureForegroundLocationPermission();
    const background = createLocationProviders().background;
    if (!background.prepareForBackgroundTracking) {
      throw new Error('Background location setup is unavailable on this device.');
    }
    await background.prepareForBackgroundTracking();
  })().finally(() => { setupRequest = null; });
  return setupRequest;
}

export function hasFinishedLocationPermissionSetup(): boolean {
  try {
    const value = window.localStorage.getItem(PERMISSION_SETUP_KEY);
    return value === 'completed' || value === 'skipped';
  } catch {
    return false;
  }
}

export function saveLocationPermissionSetup(result: 'completed' | 'skipped'): void {
  try {
    window.localStorage.setItem(PERMISSION_SETUP_KEY, result);
  } catch {
    // Setup still releases this launch; unavailable storage means it may appear again.
    console.warn('[locationPermissions] Unable to remember permission setup on this device.');
  }
}

/** Account/settings actions may reopen setup without clearing the launch marker. */
export function requestLocationPermissionSetup(): void {
  if (isAndroidPermissionSetupSupported()) {
    window.dispatchEvent(new Event(PERMISSION_SETUP_REQUEST_EVENT));
  }
}
