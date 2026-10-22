/**
 * Score Flow — chrome.storage.local Wrappers
 *
 * All state that must persist across popup opens, page reloads, and
 * service worker restarts is stored here. Never store raw grade data
 * or Neon credentials in extension storage.
 *
 * Storage keys are defined as constants to prevent typos and make
 * refactoring safe.
 */

const STORAGE_KEYS = {
  IS_AUTHENTICATED: 'isAuthenticated',
  STUDENT: 'student',              // { id, name, email }
  ID_TOKEN: 'idToken',             // Raw Google ID token JWT string
  ID_TOKEN_EXP: 'idTokenExp',      // Expiry epoch seconds (from JWT payload)
  LAST_SYNC_AT: 'lastSyncAt',      // ISO 8601 string of last successful sync
  DATA_HASH: 'dataHash',           // Hash of last synced payload (for change detection)
  SYNC_STATUS: 'syncStatus',       // 'idle' | 'syncing' | 'success' | 'error'
  SYNC_ERROR: 'syncError',         // Error message string, or null
};

// ─── Auth State ──────────────────────────────────────────────────────────────

/**
 * Returns the full authentication state. Safe to call when unauthenticated —
 * returns sensible defaults.
 */
async function getAuthState() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.IS_AUTHENTICATED,
    STORAGE_KEYS.STUDENT,
    STORAGE_KEYS.ID_TOKEN,
    STORAGE_KEYS.ID_TOKEN_EXP,
  ]);
  return {
    isAuthenticated: result[STORAGE_KEYS.IS_AUTHENTICATED] ?? false,
    student: result[STORAGE_KEYS.STUDENT] ?? null,
    idToken: result[STORAGE_KEYS.ID_TOKEN] ?? null,
    idTokenExp: result[STORAGE_KEYS.ID_TOKEN_EXP] ?? 0,
  };
}

/**
 * Persists authentication state after a successful login.
 * @param {object} params
 * @param {object} params.student - { id, name, email }
 * @param {string} params.idToken - Raw Google ID token JWT
 * @param {number} params.idTokenExp - Expiry epoch seconds from JWT
 */
async function setAuthState({ student, idToken, idTokenExp }) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.IS_AUTHENTICATED]: true,
    [STORAGE_KEYS.STUDENT]: student,
    [STORAGE_KEYS.ID_TOKEN]: idToken,
    [STORAGE_KEYS.ID_TOKEN_EXP]: idTokenExp,
  });
}

/**
 * Clears all authentication and sync data. Called on logout.
 */
async function clearAuthState() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.IS_AUTHENTICATED,
    STORAGE_KEYS.STUDENT,
    STORAGE_KEYS.ID_TOKEN,
    STORAGE_KEYS.ID_TOKEN_EXP,
    STORAGE_KEYS.DATA_HASH,
  ]);
}

// ─── Token Access ─────────────────────────────────────────────────────────────

/**
 * Returns the stored ID token, or null if not present.
 */
async function getIdToken() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ID_TOKEN);
  return result[STORAGE_KEYS.ID_TOKEN] ?? null;
}

/**
 * Updates the stored ID token and its expiry (used after silent re-auth).
 */
async function updateIdToken(idToken, idTokenExp) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.ID_TOKEN]: idToken,
    [STORAGE_KEYS.ID_TOKEN_EXP]: idTokenExp,
  });
}

// ─── Sync State ──────────────────────────────────────────────────────────────

/**
 * Returns sync state: last sync time, data hash, current sync status.
 */
async function getSyncState() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.LAST_SYNC_AT,
    STORAGE_KEYS.DATA_HASH,
    STORAGE_KEYS.SYNC_STATUS,
    STORAGE_KEYS.SYNC_ERROR,
  ]);
  return {
    lastSyncAt: result[STORAGE_KEYS.LAST_SYNC_AT] ?? null,
    dataHash: result[STORAGE_KEYS.DATA_HASH] ?? null,
    syncStatus: result[STORAGE_KEYS.SYNC_STATUS] ?? 'idle',
    syncError: result[STORAGE_KEYS.SYNC_ERROR] ?? null,
  };
}

/**
 * Records a successful sync. Updates lastSyncAt and dataHash.
 * @param {string} lastSyncAt - ISO 8601 timestamp from the backend response
 * @param {string} dataHash - Hash of the synced data
 */
async function recordSyncSuccess(lastSyncAt, dataHash) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LAST_SYNC_AT]: lastSyncAt,
    [STORAGE_KEYS.DATA_HASH]: dataHash,
    [STORAGE_KEYS.SYNC_STATUS]: 'idle',
    [STORAGE_KEYS.SYNC_ERROR]: null,
  });
}

/**
 * Updates the sync status indicator (used by popup to show real-time state).
 * @param {'idle'|'syncing'|'success'|'error'} status
 * @param {string|null} errorMessage
 */
async function setSyncStatus(status, errorMessage = null) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SYNC_STATUS]: status,
    [STORAGE_KEYS.SYNC_ERROR]: errorMessage,
  });
}

/**
 * Returns the full state snapshot the popup needs on open.
 */
async function getFullState() {
  const [authState, syncState] = await Promise.all([getAuthState(), getSyncState()]);
  return { ...authState, ...syncState };
}
