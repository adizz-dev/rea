/**
 * Score Flow — Message Type Constants
 *
 * All chrome.runtime.sendMessage / chrome.tabs.sendMessage messages
 * use a `type` field selected from these constants. Using constants
 * (instead of raw strings) prevents typos and makes message flows
 * easy to trace.
 *
 * Message direction:
 *   POPUP → SW      Popup sends to service worker
 *   SW → POPUP      Service worker updates popup (via storage + GET_STATE)
 *   SW → CS         Service worker sends to content script
 *   CS → SW         Content script sends to service worker
 */

const MSG = {
  // ── Popup → Service Worker ───────────────────────────────────────────────
  /** Popup opened: request current state snapshot. */
  GET_STATE: 'GET_STATE',

  /** User clicked "Sign in with Google" in popup. */
  AUTH_LOGIN: 'AUTH_LOGIN',

  /** User clicked "Sign out" in popup. */
  AUTH_LOGOUT: 'AUTH_LOGOUT',

  /** User clicked "Sync Scores" in popup. */
  MANUAL_SYNC: 'MANUAL_SYNC',

  // ── Service Worker → Content Script ─────────────────────────────────────
  /** SW instructs the content script to scrape the page and return data. */
  TRIGGER_SCRAPE: 'TRIGGER_SCRAPE',

  // ── Content Script → Service Worker ─────────────────────────────────────
  /** Content script sends scraped + normalized data for backend upload. */
  SYNC_DATA: 'SYNC_DATA',

  /** Content script requests auth state before deciding whether to sync. */
  CHECK_AUTH: 'CHECK_AUTH',
};
