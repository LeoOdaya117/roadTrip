import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.github.leoodaya117.roadtrip',
  appName: 'roadTrip',
  webDir: 'dist',
  android: {
    useLegacyBridge: true,
  },
};

export default config;
