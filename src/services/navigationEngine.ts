import { Capacitor, registerPlugin } from '@capacitor/core';
import type { NavigationDestination, NavigationRoute } from '../types/ride';
import { normalizeValhallaRoute } from './navigationRoute';

type RouteEndpoint = { lat: number; lng: number };

type OfflineNavigationPlugin = {
  availability(): Promise<{ available: boolean; message?: string }>;
  route(options: {
    origin: RouteEndpoint;
    destination: RouteEndpoint;
  }): Promise<{ responseJson: string }>;
  speak(options: { text: string }): Promise<void>;
  stopSpeech(): Promise<void>;
};

const OfflineNavigation = registerPlugin<OfflineNavigationPlugin>('OfflineNavigation');

const ensureAndroid = () => {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('Turn-by-turn navigation is available in the Android app.');
  }
};

export const getNavigationAvailability = async () => {
  ensureAndroid();
  return OfflineNavigation.availability();
};

export const calculateOfflineRoute = async (
  origin: RouteEndpoint,
  destination: NavigationDestination,
): Promise<NavigationRoute> => {
  ensureAndroid();
  const { responseJson } = await OfflineNavigation.route({
    origin,
    destination: { lat: destination.lat, lng: destination.lng },
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

export const supportsOfflineNavigation = () => Capacitor.getPlatform() === 'android';
