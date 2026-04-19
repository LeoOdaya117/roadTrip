import { useEffect } from 'react';
import { useRideStore } from '../store/rideStore';
import { RiderLocationEvent } from '../types/ride';
import { getEcho, leaveRideChannel } from '../services/realtime';

export const useRideChannel = (rideId?: string) => {
  const updateSingleRider = useRideStore((state) => state.updateSingleRider);

  useEffect(() => {
    if (!rideId) {
      return;
    }

    const echo = getEcho();
    if (!echo) {
      return;
    }
    const channel = echo.private(`ride.${rideId}`);

    channel.listen('RiderLocationUpdated', (event: RiderLocationEvent) => {
      if (event?.rider) {
        updateSingleRider(event.rider);
      }
    });

    return () => {
      channel.stopListening('RiderLocationUpdated');
      leaveRideChannel(rideId);
    };
  }, [rideId, updateSingleRider]);
};
