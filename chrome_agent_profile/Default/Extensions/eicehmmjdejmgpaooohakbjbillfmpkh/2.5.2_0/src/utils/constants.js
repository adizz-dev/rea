/**
 * Score Flow — Shared Constants
 *
 * All configurable values are centralized here. When deploying, update
 * BACKEND_URL and GOOGLE_CLIENT_ID to real values. Values marked VERIFY
 * require confirmation from the project owner before use.
 */

// ─── Backend API ────────────────────────────────────────────────────────────
// Automatically detect if running as unpacked extension (dev) vs installed (prod)
const _isDev = !chrome.runtime.getManifest().update_url;
const BACKEND_URL = _isDev ? 'http://127.0.0.1:3000' : 'https://score-flow-backend.vercel.app';

// ─── Google OAuth ────────────────────────────────────────────────────────────
// VERIFY: Replace with the OAuth 2.0 Client ID from Google Cloud Console.
const GOOGLE_CLIENT_ID = '786896952980-u6n98kjgh3s3rve6i1pts9n9c2b9bjq7.apps.googleusercontent.com';

// VERIFY: Replace with the exact college Google Workspace domain.
// This is the value passed as `hd=` in the OAuth URL. Must match what backend checks.
const COLLEGE_EMAIL_DOMAIN = 'sst.scaler.com';

// ─── Target Page ─────────────────────────────────────────────────────────────
// The URL pattern the content script monitors. Must match manifest.json host_permissions.
const TARGET_URL_PATTERN = 'coursera.org/degrees/bachelor-of-science-computer-science-bits';
const TARGET_URL_HOME_PATH = '/home';

// ─── Sync Behavior ───────────────────────────────────────────────────────────
// Minimum time between automatic syncs (5 minutes).
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

// Maximum number of "Show More" clicks to avoid runaway loops.
const MAX_SHOW_MORE_CLICKS = 20;

// How long to wait (ms) for each "Show More" DOM update before continuing.
const SHOW_MORE_WAIT_TIMEOUT_MS = 3000;

// How long (ms) to wait for the grades container to appear before giving up.
const DOM_WAIT_TIMEOUT_MS = 15000;

// Polling interval (ms) while waiting for grades container.
const DOM_POLL_INTERVAL_MS = 500;

// How long to observe for DOM stability before declaring the content ready.
const DOM_STABILITY_MS = 500;

// ─── Debug ───────────────────────────────────────────────────────────────────
// Set to true during development. Set to false before publishing.
// When false, console.log calls that expose sensitive data are suppressed.
const DEBUG = false;
