export type CurrentUser = {
  id: string;
  name: string;
  isHost: boolean;
};

export type LocationPoint = {
  lat: number;
  lng: number;
  speed: number | null;
  timestamp: string;
};

export type Rider = LocationPoint & {
  id: string;
  name: string;
  isHost?: boolean;
};

export type RideSession = {
  rideId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  createdAt: string;
};

export type RiderLocationEvent = {
  rider: Rider;
};
