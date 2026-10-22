/**
 * Score Flow — Google OAuth Authentication Module
 *
 * Handles the complete Google sign-in flow using chrome.identity.launchWebAuthFlow.
 *
 * ── Why launchWebAuthFlow over getAuthToken ─────────────────────────────────
 * - launchWebAuthFlow lets us use `response_type=id_token` (returns a JWT).
 * - The backend can cryptographically verify an ID token via google-auth-library.
 * - getAuthToken returns an opaque access token — not verifiable server-side.
 * - launchWebAuthFlow supports the `hd` parameter for college domain restriction.
 *
 * ── Flow ────────────────────────────────────────────────────────────────────
 * 1. Build Google OIDC URL with id_token response type and hd restriction.
 * 2. Open via launchWebAuthFlow (interactive=true shows the Google login UI).
 * 3. Parse the id_token from the redirect URL fragment (#id_token=...).
 * 4. Decode the JWT to extract expiry and user info (without verifying — the
 *    backend does cryptographic verification).
 * 5. Call POST /api/auth/verify on the backend with the token.
 * 6. Store the token, expiry, and student profile in chrome.storage.local.
 *
 * ── Token Expiry ─────────────────────────────────────────────────────────────
 * Google ID tokens expire after ~1 hour. Before each API call:
 *   - Check idTokenExp in storage
 *   - If expired, call refreshToken() to silently get a new one
 *   - If silent refresh fails, return null → popup prompts re-login
 *
 * ── VERIFY ───────────────────────────────────────────────────────────────────
 * VERIFY: GOOGLE_CLIENT_ID must be set in constants.js
 * VERIFY: COLLEGE_EMAIL_DOMAIN must be set in constants.js
 * VERIFY: The extension key must be set in manifest.json for a stable ID,
 *         which determines the redirect URI:
 *         https://<EXTENSION_ID>.chromiumapp.org/
 * VERIFY: In Google Cloud Console, add the above redirect URI to the
 *         OAuth 2.0 Web Application client's Authorized Redirect URIs.
 */

/* global
  GOOGLE_CLIENT_ID,
  COLLEGE_EMAIL_DOMAIN,
  BACKEND_URL,
  DEBUG,
  setAuthState,
  clearAuthState,
  updateIdToken,
  getAuthState
*/

// ─── Nonce Generation ─────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random nonce string.
 * Required by the OIDC spec for id_token flows to prevent replay attacks.
 */
function generateNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// ─── JWT Decoding (client-side) ───────────────────────────────────────────────

/**
 * Decodes the payload of a JWT without verifying the signature.
 * The backend performs cryptographic verification. This is used only
 * to read the `exp` claim for client-side expiry checking and `sub`/`name`/`email`
 * for caching the student profile locally.
 *
 * @param {string} token - Raw JWT string
 * @returns {object|null} Decoded payload or null on error
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64URL decode the payload part.
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ─── Auth URL Builder ─────────────────────────────────────────────────────────

/**
 * Builds the Google OIDC authorization URL.
 *
 * @param {string} nonce - Random nonce for replay protection
 * @param {'select_account'|'none'} prompt - 'select_account' for interactive,
 *        'none' for silent re-auth (will fail if no active session)
 * @param {string|null} loginHint - Email hint for silent re-auth
 * @returns {string} The authorization URL to pass to launchWebAuthFlow
 */
function buildAuthUrl(nonce, prompt = 'select_account', loginHint = null) {
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    // VERIFY: Replace COLLEGE_EMAIL_DOMAIN with the real domain.
    // This restricts the Google login UI to show only college accounts.
    hd: COLLEGE_EMAIL_DOMAIN,
    nonce,
    prompt,
  });

  if (loginHint) {
    params.set('login_hint', loginHint);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ─── Token Parsing ────────────────────────────────────────────────────────────

/**
 * Parses the id_token from the redirect URL fragment that
 * launchWebAuthFlow returns.
 *
 * The redirect URL format is:
 *   https://<EXTENSION_ID>.chromiumapp.org/#id_token=eyJ...&token_type=Bearer
 *
 * @param {string} redirectUrl
 * @returns {string|null} The id_token JWT or null if not found
 */
function parseIdTokenFromRedirect(redirectUrl) {
  try {
    // The token is in the URL fragment (#), not the query string (?).
    const hash = new URL(redirectUrl).hash;
    if (!hash) return null;
    // Remove the leading '#' and parse as URLSearchParams.
    const params = new URLSearchParams(hash.slice(1));
    return params.get('id_token') || null;
  } catch {
    return null;
  }
}

// ─── Backend Verification ─────────────────────────────────────────────────────

/**
 * Sends the ID token to the backend for cryptographic verification and
 * student record creation/update.
 *
 * @param {string} idToken
 * @returns {Promise<object>} Student profile { id, name, email, lastSyncedAt }
 */
async function verifyWithBackend(idToken) {
  const response = await fetch(`${BACKEND_URL}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || body.error || `Backend returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return data.student;
}

// ─── Main Auth Functions ──────────────────────────────────────────────────────

/**
 * Initiates an interactive Google sign-in flow.
 * Shows the Google account picker UI to the user.
 *
 * @returns {Promise<{ student: object, idToken: string }>}
 * @throws {Error} if the user cancels, the domain is wrong, or backend rejects
 */
async function login() {
  const nonce = generateNonce();
  const authUrl = buildAuthUrl(nonce, 'select_account');

  // Open the Google OAuth popup. This blocks until the user completes or cancels.
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!redirectUrl) {
    throw new Error('Authentication was cancelled.');
  }

  const idToken = parseIdTokenFromRedirect(redirectUrl);
  if (!idToken) {
    throw new Error('Could not extract ID token from Google response.');
  }

  // Decode for local caching only (backend does real verification).
  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    throw new Error('Could not decode Google ID token.');
  }

  // Verify with backend — this is where domain enforcement happens server-side.
  const student = await verifyWithBackend(idToken);

  // Persist auth state.
  await setAuthState({
    student,
    idToken,
    idTokenExp: payload.exp, // Unix epoch seconds
  });

  if (DEBUG) console.log('[ScoreFlow Auth] Login successful:', student.email);

  return { student, idToken };
}

/**
 * Attempts a silent token refresh without showing the Google UI.
 * Returns a new ID token on success, or null if silent auth is not possible.
 *
 * Called automatically by getValidToken() when the stored token is expired.
 *
 * @param {string} loginHint - The user's email (used as hint for silent flow)
 * @returns {Promise<string|null>}
 */
async function refreshToken(loginHint) {
  try {
    const nonce = generateNonce();
    const authUrl = buildAuthUrl(nonce, 'none', loginHint);

    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: false, // Non-interactive: fails if user is not already signed in
    });

    if (!redirectUrl) return null;

    const idToken = parseIdTokenFromRedirect(redirectUrl);
    if (!idToken) return null;

    const payload = decodeJwtPayload(idToken);
    if (!payload) return null;

    // Update only the token in storage (keep the student profile unchanged).
    await updateIdToken(idToken, payload.exp);

    if (DEBUG) console.log('[ScoreFlow Auth] Token refreshed silently.');
    return idToken;
  } catch {
    // Silent auth failed — user must re-authenticate interactively.
    if (DEBUG) console.log('[ScoreFlow Auth] Silent token refresh failed.');
    return null;
  }
}

/**
 * Returns a valid (non-expired) ID token for API calls.
 * Automatically refreshes the token if it is expired or close to expiry.
 *
 * Returns null if the user must re-authenticate interactively.
 *
 * @returns {Promise<string|null>}
 */
async function getValidToken() {
  const authState = await getAuthState();

  if (!authState.isAuthenticated || !authState.idToken) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  // Refresh if token expires within the next 5 minutes (buffer for API round-trip).
  const REFRESH_BUFFER_SECONDS = 5 * 60;

  if (authState.idTokenExp - nowSeconds < REFRESH_BUFFER_SECONDS) {
    if (DEBUG) console.log('[ScoreFlow Auth] Token expiring soon. Attempting silent refresh.');
    const email = authState.student?.email;
    const newToken = await refreshToken(email);
    return newToken; // null if refresh failed → triggers re-login
  }

  return authState.idToken;
}

/**
 * Signs the user out. Clears all local auth state.
 * Does NOT revoke the Google token (this is intentional — revocation
 * requires a backend call and is unnecessary for the MVP logout flow).
 */
async function logout() {
  await clearAuthState();

  // Clear Chrome's cached auth tokens.
  try {
    await chrome.identity.clearAllCachedAuthTokens();
  } catch {
    // Non-fatal if this fails.
  }

  if (DEBUG) console.log('[ScoreFlow Auth] Logged out.');
}
