import { CurrentUser } from '../types/ride';

const ID_DISPLAY_LENGTH = 6;

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
  const displayName = name ?? `Rider ${id.slice(0, ID_DISPLAY_LENGTH)}`;

  return {
    id,
    name: displayName,
    isHost
  };
};
