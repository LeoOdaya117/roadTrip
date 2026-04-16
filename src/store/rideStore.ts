import { create } from 'zustand';
import { CurrentUser, Rider } from '../types/ride';

type RideState = {
  currentUser?: CurrentUser;
  rideId?: string;
  riders: Record<string, Rider>;
  isTracking: boolean;
  setUser: (user: CurrentUser) => void;
  setRide: (rideId: string) => void;
  clearRide: () => void;
  setTracking: (isTracking: boolean) => void;
  updateRiders: (riders: Rider[]) => void;
  updateSingleRider: (rider: Rider) => void;
  removeRider: (riderId: string) => void;
};

const isRiderEqual = (a: Rider, b: Rider) =>
  a.lat === b.lat &&
  a.lng === b.lng &&
  a.speed === b.speed &&
  a.timestamp === b.timestamp &&
  a.name === b.name &&
  a.isHost === b.isHost;

export const useRideStore = create<RideState>((set) => ({
  currentUser: undefined,
  rideId: undefined,
  riders: {},
  isTracking: false,
  setUser: (user) => set({ currentUser: user }),
  setRide: (rideId) => set({ rideId }),
  clearRide: () => set({ rideId: undefined, riders: {}, isTracking: false }),
  setTracking: (isTracking) => set({ isTracking }),
  updateRiders: (riders) =>
    set((state) => {
      let hasChanges = false;
      const updated = { ...state.riders };

      riders.forEach((rider) => {
        const existing = updated[rider.id];
        if (!existing || !isRiderEqual(existing, rider)) {
          updated[rider.id] = rider;
          hasChanges = true;
        }
      });

      return hasChanges ? { riders: updated } : state;
    }),
  updateSingleRider: (rider) =>
    set((state) => {
      const existing = state.riders[rider.id];
      if (existing && isRiderEqual(existing, rider)) {
        return state;
      }
      return {
        riders: {
          ...state.riders,
          [rider.id]: {
            ...existing,
            ...rider
          }
        }
      };
    }),
  removeRider: (riderId) =>
    set((state) => {
      if (!state.riders[riderId]) {
        return state;
      }
      const updated = { ...state.riders };
      delete updated[riderId];
      return { riders: updated };
    })
}));
