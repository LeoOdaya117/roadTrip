import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

const key = import.meta.env.VITE_PUSHER_KEY ?? '';
const cluster = import.meta.env.VITE_PUSHER_CLUSTER ?? 'mt1';
const wsHost = import.meta.env.VITE_PUSHER_HOST ?? 'localhost';
const wsPort = Number(import.meta.env.VITE_PUSHER_PORT ?? 6001);
const forceTLS = (import.meta.env.VITE_PUSHER_FORCE_TLS ?? 'false') === 'true';
const authEndpoint =
  import.meta.env.VITE_PUSHER_AUTH_ENDPOINT ??
  `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'}`.replace('/api', '') +
    '/broadcasting/auth';
const realtimeFlag = import.meta.env.VITE_ENABLE_REALTIME;
const isRealtimeEnabledByConfig =
  realtimeFlag !== undefined ? realtimeFlag === 'true' : key.trim().length > 0;

let echoInstance: Echo<'pusher'> | null = null;

export const getEcho = () => {
  if (!isRealtimeEnabledByConfig || key.trim().length === 0) {
    return null;
  }

  if (echoInstance) {
    return echoInstance;
  }

  window.Pusher = Pusher;

  echoInstance = new Echo({
    broadcaster: 'pusher',
    key,
    cluster,
    wsHost,
    wsPort,
    wssPort: wsPort,
    forceTLS,
    disableStats: true,
    enabledTransports: ['ws', 'wss'],
    authEndpoint
  });

  return echoInstance;
};

export const leaveRideChannel = (rideId: string) => {
  echoInstance?.leave(`ride.${rideId}`);
};
