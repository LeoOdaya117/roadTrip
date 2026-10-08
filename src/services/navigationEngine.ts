import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { NavigationDestination, NavigationRoute } from '../types/ride';
import { normalizeValhallaRoute } from './navigationRoute';

type RouteEndpoint = { lat: number; lng: number };

type OfflineNavigationPlugin = {
  availability(): Promise<{ available: boolean; offlineAvailable: boolean; message?: string }>;
  downloadTiles(options: { url: string; sha256: string }): Promise<{ available: boolean; sizeBytes: number }>;
  addListener(
    eventName: 'tileDownloadProgress',
    listener: (event: { downloadedBytes: number; totalBytes: number; progress: number }) => void,
  ): Promise<PluginListenerHandle>;
  route(options: {
    origin: RouteEndpoint;
    destination: RouteEndpoint;
    routingUrl: string;
  }): Promise<{ responseJson: string }>;
  speak(options: { text: string }): Promise<void>;
  stopSpeech(): Promise<void>;
};

const OfflineNavigation = registerPlugin<OfflineNavigationPlugin>('OfflineNavigation');
const DEFAULT_ROUTING_URL = 'https://valhalla1.openstreetmap.de/route';
const REGIONAL_TILES_URL = 'https://github.com/LeoOdaya117/roadTrip/releases/download/offline-routing-calabarzon-v1/valhalla_tiles.tar';
const REGIONAL_TILES_SHA256 = '0eea29109df5586a4c96dc69e6623b5463bbb5ac65f721c6b94c4ff0efb56744';

const ensureAndroid = () => {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('Turn-by-turn navigation is available in the Android app.');
  }
};

export const getNavigationAvailability = async () => {
  ensureAndroid();
  return OfflineNavigation.availability();
};

export const downloadNavigationTiles = async (
  onProgress?: (progress: number) => void,
) => {
  ensureAndroid();
  const url = import.meta.env.VITE_NAVIGATION_TILES_URL?.trim() || REGIONAL_TILES_URL;
  const sha256 = import.meta.env.VITE_NAVIGATION_TILES_SHA256?.trim() || REGIONAL_TILES_SHA256;

  let listener: PluginListenerHandle | undefined;
  try {
    if (onProgress) {
      listener = await OfflineNavigation.addListener('tileDownloadProgress', (event) => {
        onProgress(Math.max(0, Math.min(100, event.progress)));
      });
    }
    return await OfflineNavigation.downloadTiles({ url, sha256 });
  } finally {
    await listener?.remove();
  }
};

export const calculateOfflineRoute = async (
  origin: RouteEndpoint,
  destination: NavigationDestination,
): Promise<NavigationRoute> => {
  ensureAndroid();
  const routingUrl = import.meta.env.VITE_NAVIGATION_ROUTING_URL?.trim()
    || DEFAULT_ROUTING_URL;
  const { responseJson } = await OfflineNavigation.route({
    origin,
    destination: { lat: destination.lat, lng: destination.lng },
    routingUrl,
  });
  return normalizeValhallaRoute(responseJson);
};

export const speakNavigationPrompt = async (text: string) => {
  ensureAndroid();
  await OfflineNavigation.speak({ text });
};

export const stopNavigationSpeech = async () => {
  if (Capacitor.getPlatform() !== 'android') return;
  await OfflineNavigation.stopSpeech();
};

export const supportsTurnByTurnNavigation = () => Capacitor.getPlatform() === 'android';
