import ForegroundGeolocationProvider from './ForegroundGeolocationProvider';
import BackgroundGeolocationProvider from './BackgroundGeolocationProvider';
import type ILocationProvider from './ILocationProvider';

let fgInstance: ILocationProvider | null = null;
let bgInstance: ILocationProvider | null = null;

export function createLocationProviders(): { foreground: ILocationProvider; background: ILocationProvider } {
  if (!fgInstance) fgInstance = new ForegroundGeolocationProvider();
  if (!bgInstance) bgInstance = new BackgroundGeolocationProvider();
  return { foreground: fgInstance, background: bgInstance };
}

export default createLocationProviders;
