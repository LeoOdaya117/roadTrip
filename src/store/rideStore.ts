import { create } from 'zustand';
import { CurrentUser, Rider, ChatMessage } from '../types/ride';

type RideState = {
  currentUser?: CurrentUser;
  rideId?: string;
  riders: Record<string, Rider>;
  messages: ChatMessage[];
  isTracking: boolean;
  isSoloMode: boolean;
  currentTopic?: string | null;
  setUser: (user: CurrentUser) => void;
  updateCurrentUser: (user: CurrentUser) => void;
  setRide: (rideId: string) => void;
  clearRide: () => void;
  setTracking: (isTracking: boolean) => void;
  setSoloMode: (isSolo: boolean) => void;
  updateRiders: (riders: Rider[]) => void;
  updateSingleRider: (rider: Rider) => void;
  setRiderTopic: (riderId: string, topic: string, enabled: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  setCurrentTopic: (topic: string | null) => void;
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
  messages: [],
  currentTopic: null,
  isTracking: false,
  isSoloMode: false,
  setUser: (user) => set({ currentUser: user }),
  updateCurrentUser: (user) => set({ currentUser: user }),
  setRide: (rideId) => set({ rideId }),
  clearRide: () => set({ rideId: undefined, riders: {}, isTracking: false, isSoloMode: false }),
  setTracking: (isTracking) => set({ isTracking }),
  setSoloMode: (isSoloMode) => set({ isSoloMode }),
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
  setRiderTopic: (riderId, topic, enabled) =>
    set((state) => {
      const existing = state.riders[riderId];
      if (!existing) return state;
      const topics = new Set(existing.activeTopics ?? []);
      if (enabled) topics.add(topic);
      else topics.delete(topic);
      return {
        riders: {
          ...state.riders,
          [riderId]: {
            ...existing,
            activeTopics: Array.from(topics)
          }
        }
      };
    }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setCurrentTopic: (topic) => set({ currentTopic: topic }),
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
