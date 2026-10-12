import { useCallback, useEffect, useRef, useState } from 'react';
import { listSavedPlaces, removeSavedPlace, saveSavedPlace } from '../services/savedPlaces';
import type { SavedPlace, SavedPlaceInput } from '../types/savedPlace';

const sortPlaces = (places: SavedPlace[]) => {
  const order = { home: 0, work: 1, custom: 2 } as const;
  return [...places].sort((left, right) =>
    order[left.kind] - order[right.kind] || left.name.localeCompare(right.name),
  );
};

export const useSavedPlaces = () => {
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const revisionRef = useRef(0);

  const refresh = useCallback(async () => {
    const revision = revisionRef.current;
    setIsLoading(true);
    try {
      const nextPlaces = await listSavedPlaces();
      if (!mountedRef.current || revision !== revisionRef.current) return;
      setSavedPlaces(sortPlaces(nextPlaces));
      setLoadError(null);
    } catch (error) {
      if (!mountedRef.current || revision !== revisionRef.current) return;
      setLoadError(error instanceof Error ? error.message : 'Saved places are unavailable.');
    } finally {
      if (mountedRef.current && revision === revisionRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  const save = useCallback(async (input: SavedPlaceInput) => {
    const savedPlace = await saveSavedPlace(input);
    revisionRef.current += 1;
    if (mountedRef.current) {
      setSavedPlaces((current) => sortPlaces([
        ...current.filter((place) => place.id !== savedPlace.id),
        savedPlace,
      ]));
      setLoadError(null);
      setIsLoading(false);
    }
    return savedPlace;
  }, []);

  const remove = useCallback(async (id: string) => {
    await removeSavedPlace(id);
    revisionRef.current += 1;
    if (mountedRef.current) {
      setSavedPlaces((current) => current.filter((place) => place.id !== id));
      setLoadError(null);
      setIsLoading(false);
    }
  }, []);

  return { savedPlaces, isLoading, loadError, refresh, save, remove };
};
