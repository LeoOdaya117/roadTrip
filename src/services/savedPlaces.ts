import {
  deleteSavedPlaceRecord,
  getSavedPlaceRecords,
  putSavedPlaceRecord,
} from './offlineDb';
import type { SavedPlace, SavedPlaceInput } from '../types/savedPlace';
import type { NavigationDestination } from '../types/ride';

const RESERVED_NAMES = new Set(['home', 'work']);
let fallbackId = 0;

const createCustomId = () => {
  if (globalThis.crypto?.randomUUID) return `custom-${globalThis.crypto.randomUUID()}`;
  fallbackId += 1;
  return `custom-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
};

const isConstraintError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'ConstraintError';

export const listSavedPlaces = async (): Promise<SavedPlace[]> => {
  const kindOrder = { home: 0, work: 1, custom: 2 } as const;
  return (await getSavedPlaceRecords()).sort((left, right) =>
    kindOrder[left.kind] - kindOrder[right.kind] || left.name.localeCompare(right.name),
  );
};

export const saveSavedPlace = async (input: SavedPlaceInput): Promise<SavedPlace> => {
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90
    || !Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    throw new Error('Choose a valid location before saving this place.');
  }

  const addressLabel = input.addressLabel.trim();
  if (!addressLabel) throw new Error('Choose a place with a name before saving it.');

  let name: string;
  let id: string;
  if (input.kind === 'home') {
    name = 'Home';
    id = 'home';
  } else if (input.kind === 'work') {
    name = 'Work';
    id = 'work';
  } else {
    name = input.name?.trim() ?? '';
    if (!name) throw new Error('Enter a name for this saved place.');
    if (RESERVED_NAMES.has(name.normalize('NFKC').toLowerCase())) {
      throw new Error('Home and Work are reserved names. Choose another name.');
    }
    if (input.id === 'home' || input.id === 'work') {
      throw new Error('This saved place cannot use a reserved slot.');
    }
    id = input.id ?? createCustomId();
  }

  const place: SavedPlace = {
    id,
    kind: input.kind,
    name,
    addressLabel,
    lat: input.lat,
    lng: input.lng,
  };

  try {
    await putSavedPlaceRecord(place);
  } catch (error) {
    if (isConstraintError(error)) {
      throw new Error('A saved place already uses that name. Choose another name.');
    }
    throw error;
  }

  return place;
};

export const removeSavedPlace = async (id: string): Promise<void> => {
  await deleteSavedPlaceRecord(id);
};

export const toNavigationDestination = (place: SavedPlace): NavigationDestination => ({
  lat: place.lat,
  lng: place.lng,
  label: place.name,
});
