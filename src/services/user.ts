import { CurrentUser } from '../types/ride';

const createId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `user-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
};

export const createLocalUser = (isHost: boolean, name?: string): CurrentUser => {
  const id = createId();
  const displayName = name ?? `Rider ${id.slice(0, 4)}`;

  return {
    id,
    name: displayName,
    isHost
  };
};
