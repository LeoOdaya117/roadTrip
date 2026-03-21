// Local DB placeholder. Initialize a client (e.g. Dexie) here when needed.
// For now this exports minimal helpers so other modules can import from `src/db`.

export async function initLocalDb() {
  // TODO: initialize Dexie or other local DB here
  return null;
}

export default {
  initLocalDb,
};
