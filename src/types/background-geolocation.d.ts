declare module '@capacitor-community/background-geolocation' {
  export interface BackgroundGeolocationPlugin {
    addWatcher(options: any, callback: (location: any, error?: any) => void): Promise<string>;
    removeWatcher(opts: { id: string }): Promise<void>;
    hasPermissions(): Promise<any>;
    openSettings?(): Promise<void>;
  }

  const BackgroundGeolocation: BackgroundGeolocationPlugin;
  export default BackgroundGeolocation;
}
