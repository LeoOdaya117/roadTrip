import axios from 'axios';
import { CurrentUser, Rider } from '../types/ride';
import type { LocationOutboxRecord } from './offlineDb';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000
});

const formatApiError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const message =
      (error.response?.data as { message?: string } | undefined)?.message ??
      error.message ??
      'Request failed';
    return new Error(message);
  }

  return new Error('Unexpected error');
};

export type RideResponse = {
  rideId: string;
  rider: Rider;
  riders?: Rider[];
};

export const createRide = async (user: CurrentUser) => {
  try {
    const response = await api.post<RideResponse>('/rides', {
      userId: user.id,
      name: user.name
    });
    return response.data;
  } catch (error) {
    throw formatApiError(error);
  }
};

export const joinRide = async (rideCode: string, user: CurrentUser) => {
  try {
    const response = await api.post<RideResponse>(`/rides/${rideCode}/join`, {
      userId: user.id,
      name: user.name
    });
    return response.data;
  } catch (error) {
    throw formatApiError(error);
  }
};

export const sendLocation = async (
  rideId: string,
  riderId: string,
  lat: number,
  lng: number,
  speed: number | null
) => {
  try {
    await api.post(`/rides/${rideId}/location`, {
      riderId,
      lat,
      lng,
      speed
    });
  } catch (error) {
    throw formatApiError(error);
  }
};

export type LocationBatchResponse = {
  acceptedPointIds: string[];
  rejected: Array<{ pointId: string; reason: string }>;
};

export class LocationBatchRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LocationBatchRequestError';
  }
}

export const sendLocationBatch = async (
  rideId: string,
  riderId: string,
  records: LocationOutboxRecord[],
) => {
  try {
    const response = await api.post<LocationBatchResponse>(
      `/rides/${rideId}/locations/batch`,
      {
        riderId,
        points: records.map((record) => ({
          pointId: record.pointId,
          timestamp: record.timestamp,
          lat: record.lat,
          lng: record.lng,
          speed: record.speed,
          accuracy: record.accuracy,
          source: record.source,
        })),
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message =
        (error.response?.data as { message?: string } | undefined)?.message ??
        error.message ??
        'Location batch request failed';
      throw new LocationBatchRequestError(message, error.response?.status);
    }
    throw new LocationBatchRequestError('Unexpected location batch error');
  }
};
