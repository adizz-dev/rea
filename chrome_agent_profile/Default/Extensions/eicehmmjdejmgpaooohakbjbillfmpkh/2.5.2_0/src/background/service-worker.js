/**
 * Score Flow — Background Service Worker
 *
 * Self-contained script. All constants and storage helpers are inlined so
 * this file works as a standard (non-module) MV3 service worker without
 * conflicting with the content scripts' global variable approach.
 *
 * This is the ONLY component that:
 *   - Calls the backend API
 *   - Manages authentication state
 *   - Coordinates popup ↔ content script communication
 *
 * ALL persistent state lives in chrome.storage.local. Service workers are
 * ephemeral — never use global variables for state.
 *
 * Message routing:
 *   Popup → SW:          GET_STATE, AUTH_LOGIN, AUTH_LOGOUT, MANUAL_SYNC
 *   Content Script → SW: SYNC_DATA, CHECK_AUTH
 */

'use strict';

// ── Inlined Constants ──────────────────────────────────────────────────────────
// Automatically detect if running as unpacked extension (dev) vs installed (prod)
const _swIsDev = !chrome.runtime.getManifest().update_url;
const SW_BACKEND_URL = _swIsDev ? 'http://127.0.0.1:3000' : 'https://score-flow-backend.vercel.app';
const SW_GOOGLE_CLIENT_ID = '786896952980-u6n98kjgh3s3rve6i1pts9n9c2b9bjq7.apps.googleusercontent.com';
const SW_COLLEGE_DOMAIN   = 'sst.scaler.com';
const SW_DEBUG            = false;

// ── Storage Keys ───────────────────────────────────────────────────────────────
const SK = {
  IS_AUTHENTICATED: 'isAuthenticated',
  STUDENT:          'student',
  ID_TOKEN:         'idToken',
  ID_TOKEN_EXP:     'idTokenExp',
  LAST_SYNC_AT:     'lastSyncAt',
  DATA_HASH:        'dataHash',
  SYNC_STATUS:      'syncStatus',
  SYNC_ERROR:       'syncError',
  LOGIN_ERROR:      'loginError',
};

// ── Storage Helpers ────────────────────────────────────────────────────────────

async function sw_getAuthState() {
  const r = await chrome.storage.local.get([SK.IS_AUTHENTICATED, SK.STUDENT, SK.ID_TOKEN, SK.ID_TOKEN_EXP]);
  return {
    isAuthenticated: r[SK.IS_AUTHENTICATED] ?? false,
    student:         r[SK.STUDENT]          ?? null,
    idToken:         r[SK.ID_TOKEN]         ?? null,
    idTokenExp:      r[SK.ID_TOKEN_EXP]     ?? 0,
    loginError:      r[SK.LOGIN_ERROR]      ?? null,
  };
}

async function sw_setAuthState({ student, idToken, idTokenExp }) {
  await chrome.storage.local.set({
    [SK.IS_AUTHENTICATED]: true,
    [SK.STUDENT]:          student,
    [SK.ID_TOKEN]:         idToken,
    [SK.ID_TOKEN_EXP]:     idTokenExp,
    [SK.LOGIN_ERROR]:      null, // clear on success
  });
}

async function sw_clearAuthState() {
  await chrome.storage.local.remove([
    SK.IS_AUTHENTICATED, SK.STUDENT, SK.ID_TOKEN, SK.ID_TOKEN_EXP, SK.DATA_HASH, SK.LOGIN_ERROR
  ]);
}

async function sw_setLoginError(errorMessage) {
  if (errorMessage) {
    await chrome.storage.local.set({ [SK.LOGIN_ERROR]: errorMessage });
  } else {
    await chrome.storage.local.remove([SK.LOGIN_ERROR]);
  }
}

async function sw_updateIdToken(idToken, idTokenExp) {
  await chrome.storage.local.set({ [SK.ID_TOKEN]: idToken, [SK.ID_TOKEN_EXP]: idTokenExp });
}

async function sw_getSyncState() {
  const r = await chrome.storage.local.get([SK.LAST_SYNC_AT, SK.DATA_HASH, SK.SYNC_STATUS, SK.SYNC_ERROR]);
  return {
    lastSyncAt: r[SK.LAST_SYNC_AT] ?? null,
    dataHash:   r[SK.DATA_HASH]    ?? null,
    syncStatus: r[SK.SYNC_STATUS]  ?? 'idle',
    syncError:  r[SK.SYNC_ERROR]   ?? null,
  };
}

async function sw_recordSyncSuccess(lastSyncAt, dataHash) {
  await chrome.storage.local.set({
    [SK.LAST_SYNC_AT]: lastSyncAt,
    [SK.DATA_HASH]:    dataHash,
    [SK.SYNC_STATUS]:  'idle',
    [SK.SYNC_ERROR]:   null,
  });
}

async function sw_setSyncStatus(status, errorMessage = null) {
  await chrome.storage.local.set({
    [SK.SYNC_STATUS]: status,
    [SK.SYNC_ERROR]:  errorMessage,
  });
}

async function sw_getFullState() {
  const [auth, sync] = await Promise.all([sw_getAuthState(), sw_getSyncState()]);
  return { ...auth, ...sync };
}

// ── Auth Helpers ───────────────────────────────────────────────────────────────

function sw_decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch { return null; }
}

function sw_generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function sw_buildAuthUrl(nonce, prompt = 'select_account', loginHint = null) {
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const params = new URLSearchParams({
    client_id:     SW_GOOGLE_CLIENT_ID,
    response_type: 'id_token',
    redirect_uri:  redirectUri,
    scope:         'openid email profile',
    hd:            SW_COLLEGE_DOMAIN,
    nonce,
    prompt,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function sw_parseIdToken(redirectUrl) {
  try {
    const hash = new URL(redirectUrl).hash;
    if (!hash) return null;
    return new URLSearchParams(hash.slice(1)).get('id_token') || null;
  } catch { return null; }
}

// ── Token Management ───────────────────────────────────────────────────────────

/**
 * Returns a valid (non-expired) ID token.
 * Attempts silent refresh if the token is expired or expiring soon.
 * Returns null if the user must re-authenticate interactively.
 */
async function sw_getValidToken() {
  const auth = await sw_getAuthState();
  if (!auth.isAuthenticated || !auth.idToken) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const BUFFER = 5 * 60; // 5 minutes

  if (auth.idTokenExp - nowSec < BUFFER) {
    if (SW_DEBUG) console.log('[ScoreFlow SW] Token expiring — attempting silent refresh.');
    try {
      const nonce    = sw_generateNonce();
      const url      = sw_buildAuthUrl(nonce, 'none', auth.student?.email);
      const redirect = await chrome.identity.launchWebAuthFlow({ url, interactive: false });
      if (!redirect) return null;
      const newToken = sw_parseIdToken(redirect);
      if (!newToken) return null;
      const payload  = sw_decodeJwtPayload(newToken);
      if (!payload) return null;
      await sw_updateIdToken(newToken, payload.exp);
      return newToken;
    } catch {
      if (SW_DEBUG) console.log('[ScoreFlow SW] Silent refresh failed.');
      return null;
    }
  }

  return auth.idToken;
}

// ── Backend API ────────────────────────────────────────────────────────────────

async function sw_callBackend(path, method, body, idToken) {
  const options = {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
  };
  if (body) options.body = JSON.stringify(body);
  return fetch(`${SW_BACKEND_URL}${path}`, options);
}

// ── Data Hash (FNV-1a) ─────────────────────────────────────────────────────────

function sw_computeDataHash(assignments = []) {
  const canonical = assignments
    .map(a => `${a.assignmentHref}|${a.gradePercentage}`)
    .sort()
    .join('\n');
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}

// ── Message Handlers ───────────────────────────────────────────────────────────

async function handleGetState(sendResponse) {
  try {
    sendResponse(await sw_getFullState());
  } catch (err) {
    sendResponse({ isAuthenticated: false, error: err.message });
  }
}

async function handleLogin(sendResponse) {
  try {
    await sw_setLoginError(null);
    const nonce      = sw_generateNonce();
    const authUrl    = sw_buildAuthUrl(nonce, 'select_account');
    const redirectUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });

    if (!redirectUrl) {
      const err = 'Authentication was cancelled.';
      await sw_setLoginError(err);
      return sendResponse({ success: false, error: err });
    }

    const idToken = sw_parseIdToken(redirectUrl);
    if (!idToken) {
      const err = 'Could not extract ID token.';
      await sw_setLoginError(err);
      return sendResponse({ success: false, error: err });
    }

    const payload = sw_decodeJwtPayload(idToken);
    if (!payload) {
      const err = 'Could not decode ID token.';
      await sw_setLoginError(err);
      return sendResponse({ success: false, error: err });
    }

    // Verify with backend — backend enforces domain restriction server-side.
    const resp = await sw_callBackend('/api/auth/verify', 'POST', null, idToken);
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const err = body.message || body.error || `Sign in failed (${resp.status})`;
      await sw_setLoginError(err);
      return sendResponse({ success: false, error: err });
    }

    const { student } = await resp.json();
    await sw_setAuthState({ student, idToken, idTokenExp: payload.exp });

    if (SW_DEBUG) console.log('[ScoreFlow SW] Login OK:', student.email);
    sendResponse({ success: true, student });

  } catch (error) {
    if (SW_DEBUG) console.error('[ScoreFlow SW] Login error:', error);
    const errStr = error.message || 'Sign in failed. Please try again.';
    await sw_setLoginError(errStr);
    sendResponse({ success: false, error: errStr });
  }
}

async function handleLogout(sendResponse) {
  try {
    await sw_clearAuthState();
    try { await chrome.identity.clearAllCachedAuthTokens(); } catch { /* non-fatal */ }
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleManualSync(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: 'https://www.coursera.org/degrees/bachelor-of-science-computer-science-bits/home*',
    });

    if (!tabs || tabs.length === 0) {
      return sendResponse({
        success: false,
        error: 'Please first open your Coursera degree Home page.',
      });
    }

    // Tell the content script to scrape; it will send SYNC_DATA back.
    await chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_SCRAPE', manual: true });
    sendResponse({ success: true });

  } catch (err) {
    let errorMsg = err.message;
    if (errorMsg.includes('Receiving end does not exist')) {
      errorMsg = 'Please refresh the Coursera page to connect the extension.';
    }
    sendResponse({ success: false, error: errorMsg });
  }
}

async function handleCheckAuth(sendResponse) {
  const auth = await sw_getAuthState();
  sendResponse({ isAuthenticated: auth.isAuthenticated, student: auth.student });
}

async function handleSyncData(payload, sendResponse) {
  try {
    await sw_setSyncStatus('syncing');

    const idToken = await sw_getValidToken();
    if (!idToken) {
      await sw_clearAuthState();
      await sw_setSyncStatus('error', 'Session expired. Please sign in again.');
      return sendResponse({ success: false, error: 'Session expired.' });
    }

    const resp = await sw_callBackend('/api/sync', 'POST', payload, idToken);

    if (!resp.ok) {
      const body   = await resp.json().catch(() => ({}));
      const errMsg = body.message || body.error || `Sync failed (${resp.status})`;
      await sw_setSyncStatus('error', errMsg);
      return sendResponse({ success: false, error: errMsg });
    }

    const data     = await resp.json();
    const dataHash = sw_computeDataHash(payload.assignments || []);
    await sw_recordSyncSuccess(data.summary?.syncedAt || new Date().toISOString(), dataHash);

    if (SW_DEBUG) console.log('[ScoreFlow SW] Sync OK:', data.summary);
    sendResponse({ success: true, summary: data.summary });

  } catch (err) {
    if (SW_DEBUG) console.error('[ScoreFlow SW] Sync error:', err);
    await sw_setSyncStatus('error', 'Could not reach the server. Check your connection.');
    sendResponse({ success: false, error: err.message });
  }
}

// ── Message Router ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (SW_DEBUG) console.log('[ScoreFlow SW] Message:', message.type);

  switch (message.type) {
    case 'GET_STATE':   handleGetState(sendResponse);                     return true;
    case 'AUTH_LOGIN':  handleLogin(sendResponse);                        return true;
    case 'AUTH_LOGOUT': handleLogout(sendResponse);                       return true;
    case 'MANUAL_SYNC': handleManualSync(sendResponse);                   return true;
    case 'CHECK_AUTH':  handleCheckAuth(sendResponse);                    return true;
    case 'SYNC_DATA':   handleSyncData(message.payload, sendResponse);    return true;
    default:
      if (SW_DEBUG) console.warn('[ScoreFlow SW] Unknown message:', message.type);
      return false;
  }
});

if (SW_DEBUG) console.log('[ScoreFlow SW] Initialized.');
