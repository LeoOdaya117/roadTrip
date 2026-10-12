import { LocationPoint } from '../types/ride';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

export interface ILocationProvider {
  /** Request platform permissions needed to keep tracking while the app is inactive. */
  prepareForBackgroundTracking?(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  onLocation(callback: (point: LocationPoint) => void): () => void;
  getPermissionState(): Promise<PermissionState>;
}

export default ILocationProvider;
