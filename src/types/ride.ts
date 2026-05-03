export type CurrentUser = {
  id: string;
  name: string;
  isHost: boolean;
  avatarUrl?: string;
};

export type LocationPoint = {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy?: number | null;
  timestamp: string;
};

export type Rider = LocationPoint & {
  id: string;
  name: string;
  isHost?: boolean;
  /** Optional avatar image URL to display on the map marker */
  avatarUrl?: string;
  /** Optional additional photos to show in the popup */
  photos?: string[];
  /** Active lightweight topic flags (e.g. ['fuel', 'help']) */
  activeTopics?: string[];
};

export type ChatMessage = {
  id: string;
  topic: string;
  text: string;
  senderId: string;
  timestamp: string;
};

export type RideSession = {
  rideId: string;
  userId: string;
  userName: string;
  isHost: boolean;
  createdAt: string;
  isSolo?: boolean;
  endedAt?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  /** session lifecycle status — e.g. 'active' | 'ended' */
  status?: 'active' | 'ended' | 'paused';
};

export type PhotoRecord = {
  id?: number;
  rideId: string;
  // full-size image blob
  data?: Blob;
  // thumbnail image blob
  thumb?: Blob;
  lat?: number;
  lng?: number;
  timestamp: string;
  note?: string;
};

export type RiderLocationEvent = {
  rider: Rider;
};
