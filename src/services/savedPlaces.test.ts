import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteSession, rideDb, saveRideSession } from './offlineDb';
import {
  listSavedPlaces,
  removeSavedPlace,
  saveSavedPlace,
  toNavigationDestination,
} from './savedPlaces';
import type { SavedPlaceInput } from '../types/savedPlace';

const home: SavedPlaceInput = {
  kind: 'home',
  addressLabel: '  Quezon City, Philippines  ',
  lat: 14.65,
  lng: 121.05,
};

describe('saved places', () => {
  beforeEach(async () => {
    rideDb.close();
    await Dexie.delete('rideTrackerDb');
    await rideDb.open();
  });

  afterEach(async () => {
    rideDb.close();
    await Dexie.delete('rideTrackerDb');
  });

  it('starts empty and persists Home, Work, and custom places across a database reopen', async () => {
    expect(await listSavedPlaces()).toEqual([]);

    const savedHome = await saveSavedPlace(home);
    const savedWork = await saveSavedPlace({
      kind: 'work',
      addressLabel: 'Makati, Philippines',
      lat: 14.55,
      lng: 121.02,
    });
    const savedCafe = await saveSavedPlace({
      kind: 'custom',
      name: 'Coffee stop',
      addressLabel: 'Tagaytay, Cavite',
      lat: 14.1,
      lng: 120.9,
    });

    expect(savedHome).toMatchObject({ id: 'home', kind: 'home', name: 'Home', addressLabel: 'Quezon City, Philippines' });
    expect(savedWork).toMatchObject({ id: 'work', kind: 'work', name: 'Work' });
    expect(savedCafe.id).toMatch(/^custom-/);
    expect((await listSavedPlaces()).map(({ name }) => name)).toEqual(['Home', 'Work', 'Coffee stop']);

    rideDb.close();
    await rideDb.open();
    expect(await listSavedPlaces()).toEqual([savedHome, savedWork, savedCafe]);
  });

  it('replaces an existing Home or Work slot in place', async () => {
    await saveSavedPlace(home);
    const updated = await saveSavedPlace({ ...home, addressLabel: 'Pasig, Philippines', lat: 14.57, lng: 121.08 });
    await saveSavedPlace({
      kind: 'work',
      addressLabel: 'Makati, Philippines',
      lat: 14.55,
      lng: 121.02,
    });
    const updatedWork = await saveSavedPlace({
      kind: 'work',
      addressLabel: 'BGC, Taguig',
      lat: 14.55,
      lng: 121.05,
    });

    expect(updated).toMatchObject({ id: 'home', name: 'Home', addressLabel: 'Pasig, Philippines', lat: 14.57, lng: 121.08 });
    expect(updatedWork).toMatchObject({ id: 'work', name: 'Work', addressLabel: 'BGC, Taguig', lng: 121.05 });
    expect(await listSavedPlaces()).toHaveLength(2);
  });

  it('trims custom names and rejects empty, reserved, or duplicate names', async () => {
    const saved = await saveSavedPlace({
      kind: 'custom',
      name: '  Studio  ',
      addressLabel: 'Manila',
      lat: 14.6,
      lng: 121,
    });
    expect(saved.name).toBe('Studio');

    await expect(saveSavedPlace({
      kind: 'custom',
      name: 'studio',
      addressLabel: 'Mandaluyong',
      lat: 14.58,
      lng: 121.03,
    })).rejects.toThrow('already uses that name');
    await expect(saveSavedPlace({
      kind: 'custom',
      name: 'Ｓｔｕｄｉｏ',
      addressLabel: 'Mandaluyong',
      lat: 14.58,
      lng: 121.03,
    })).rejects.toThrow('already uses that name');
    await expect(saveSavedPlace({ ...home, kind: 'custom', name: ' home ' })).rejects.toThrow('reserved names');
    await expect(saveSavedPlace({ ...home, kind: 'custom', name: 'Ｗｏｒｋ' })).rejects.toThrow('reserved names');
    await expect(saveSavedPlace({ ...home, kind: 'custom', name: '   ' })).rejects.toThrow('Enter a name');
  });

  it('keeps a custom ID while editing its name and location', async () => {
    const created = await saveSavedPlace({
      kind: 'custom',
      name: 'Office',
      addressLabel: 'Old location',
      lat: 14.6,
      lng: 121,
    });

    const updated = await saveSavedPlace({
      ...created,
      name: 'Workshop',
      addressLabel: 'New location',
      lat: 14.1,
      lng: 120.9,
    });

    expect(updated).toMatchObject({
      id: created.id,
      kind: 'custom',
      name: 'Workshop',
      addressLabel: 'New location',
      lat: 14.1,
      lng: 120.9,
    });
  });

  it('maps a saved place into the existing destination shape and removes it by ID', async () => {
    const saved = await saveSavedPlace({ ...home, lat: 14.1, lng: 120.9 });
    expect(toNavigationDestination(saved)).toEqual({ lat: 14.1, lng: 120.9, label: 'Home' });

    await removeSavedPlace(saved.id);
    expect(await listSavedPlaces()).toEqual([]);
  });

  it('rejects invalid coordinates and a missing original place label', async () => {
    await expect(saveSavedPlace({ ...home, lat: 91 })).rejects.toThrow('valid location');
    await expect(saveSavedPlace({ ...home, lng: Number.NaN })).rejects.toThrow('valid location');
    await expect(saveSavedPlace({ ...home, addressLabel: '   ' })).rejects.toThrow('name before saving');
  });

  it('keeps favorites independent from ride-session deletion', async () => {
    const saved = await saveSavedPlace(home);
    await saveRideSession({
      rideId: 'solo-saved-place',
      userId: 'rider-1',
      userName: 'Rider',
      isHost: true,
      isSolo: true,
      createdAt: '2026-10-12T00:00:00.000Z',
      navigationDestination: { lat: saved.lat, lng: saved.lng, label: saved.name },
    });

    await deleteSession('solo-saved-place');

    expect(await listSavedPlaces()).toEqual([saved]);
  });
});
