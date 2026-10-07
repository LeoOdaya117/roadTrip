import { LocationPoint } from '../types/ride';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

export interface ILocationProvider {
  start(): Promise<void>;
  stop(): void;
  onLocation(callback: (point: LocationPoint) => void): () => void;
  getPermissionState(): Promise<PermissionState>;
}

export default ILocationProvider;
