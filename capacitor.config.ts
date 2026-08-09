import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'roadTrip',
  webDir: 'dist',
  android: {
    useLegacyBridge: true,
  },
};

export default config;
