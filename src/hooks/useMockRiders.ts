import { useEffect, useMemo, useRef } from 'react';
import { useRideStore } from '../store/rideStore';
import { Rider } from '../types/ride';

type MockRidersParams = {
  enabled: boolean;
  origin: { lat: number; lng: number };
};

const MOVE_INTERVAL = 3000;

export const useMockRiders = ({ enabled, origin }: MockRidersParams) => {
  const updateRiders = useRideStore((state) => state.updateRiders);
  const mockRidersRef = useRef<Rider[]>([]);

  const baseRiders = useMemo(
    () => [
      {
        id: 'mock-1',
        name: 'Ava',
        lat: origin.lat + 0.002,
        lng: origin.lng + 0.001,
        speed: 12,
        timestamp: new Date().toISOString()
      },
      {
        id: 'mock-2',
        name: 'Noah',
        lat: origin.lat - 0.0015,
        lng: origin.lng + 0.0012,
        speed: 9,
        timestamp: new Date().toISOString()
      },
      {
        id: 'mock-3',
        name: 'Luna',
        lat: origin.lat + 0.0012,
        lng: origin.lng - 0.0018,
        speed: 10,
        timestamp: new Date().toISOString()
      }
    ],
    [origin.lat, origin.lng]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    mockRidersRef.current = baseRiders;
    updateRiders(baseRiders);

    const interval = window.setInterval(() => {
      mockRidersRef.current = mockRidersRef.current.map((rider) => ({
        ...rider,
        lat: rider.lat + (Math.random() - 0.5) * 0.0006,
        lng: rider.lng + (Math.random() - 0.5) * 0.0006,
        speed: Math.max(6, Math.min(18, (rider.speed ?? 10) + (Math.random() - 0.5) * 2)),
        timestamp: new Date().toISOString()
      }));

      updateRiders(mockRidersRef.current);
    }, MOVE_INTERVAL);

    return () => window.clearInterval(interval);
  }, [baseRiders, enabled, updateRiders]);
};
