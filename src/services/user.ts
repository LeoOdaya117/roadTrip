import { CurrentUser } from '../types/ride';

const ID_DISPLAY_LENGTH = 6;

const PROFILE_NAME_KEY = 'rt_profile_name';
const PROFILE_AVATAR_KEY = 'rt_profile_avatar';

export type UserProfile = { name?: string; avatarUrl?: string };

export const loadUserProfile = (): UserProfile => ({
  name: localStorage.getItem(PROFILE_NAME_KEY) ?? undefined,
  avatarUrl: localStorage.getItem(PROFILE_AVATAR_KEY) ?? undefined,
});

export const saveUserProfile = ({ name, avatarUrl }: UserProfile): boolean => {
  try {
    if (name !== undefined) {
      if (name) localStorage.setItem(PROFILE_NAME_KEY, name);
      else localStorage.removeItem(PROFILE_NAME_KEY);
    }
    if (avatarUrl !== undefined) {
      if (avatarUrl) localStorage.setItem(PROFILE_AVATAR_KEY, avatarUrl);
      else localStorage.removeItem(PROFILE_AVATAR_KEY);
    }
    return true;
  } catch (e) {
    // Could be QuotaExceededError or other storage issues
    console.warn('Failed to save user profile to localStorage', e);
    return false;
  }
};

const createId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `user-${Date.now().toString(16)}`;
};

export const createLocalUser = (isHost: boolean, name?: string): CurrentUser => {
  const id = createId();
  const profile = loadUserProfile();
  const displayName = name ?? profile.name ?? `Rider ${id.slice(0, ID_DISPLAY_LENGTH)}`;

  return {
    id,
    name: displayName,
    isHost,
    avatarUrl: profile.avatarUrl,
  };
};
