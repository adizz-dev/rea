/**
 * Score Flow — Popup Controller
 *
 * Manages the popup's UI state by communicating with the service worker.
 * The popup has a very short lifecycle (closes when user clicks away),
 * so all persistent state is read from the service worker via messages
 * and reflected in chrome.storage.local — never stored in local JS variables.
 *
 * State machine:
 *   loading → logged-out (no auth)
 *   loading → logged-in  (auth exists)
 *
 * Sync status transitions:
 *   idle → syncing → success → idle
 *   idle → syncing → error
 */

// ── Message Types (must match messaging.js) ──────────────────────────────────
// These are re-declared here because popup.js is loaded in its own isolated
// HTML page context and does not share globals with content scripts.
const MSG = {
  GET_STATE:    'GET_STATE',
  AUTH_LOGIN:   'AUTH_LOGIN',
  AUTH_LOGOUT:  'AUTH_LOGOUT',
  MANUAL_SYNC:  'MANUAL_SYNC',
};

// ── App Configuration ─────────────────────────────────────────────────────────
const APP_CONFIG = {
  // Automatically pull version from manifest.json
  VERSION: chrome.runtime.getManifest().version,
  PRIVACY_POLICY_URL: 'https://docs.google.com/document/d/e/2PACX-1vS1hPj_A2lRpnFNZxvYm0LuxA--u7zWBjQ4FbUfiBhJaIF96-BdVdw-hXZpcPFjwZou8UHy7ANOztYL/pub'
};

// ── DOM References ────────────────────────────────────────────────────────────
const viewLoading   = document.getElementById('view-loading');
const viewLoggedOut = document.getElementById('view-logged-out');
const viewLoggedIn  = document.getElementById('view-logged-in');

const btnLogin      = document.getElementById('btn-login');
const btnSync       = document.getElementById('btn-sync');
const btnLogout     = document.getElementById('btn-logout');

const ageCheckbox   = document.getElementById('ageCheckbox');
const consentCheckbox = document.getElementById('consentCheckbox');
const privacyCheckbox = document.getElementById('privacyCheckbox');

const studentName   = document.getElementById('student-name');
const studentEmail  = document.getElementById('student-email');
const lastSyncTime  = document.getElementById('last-sync-time');
const statusBar     = document.getElementById('status-bar');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const syncIcon      = document.getElementById('sync-icon');
const syncBtnText   = document.getElementById('sync-btn-text');
const errorMessage  = document.getElementById('error-message');
const errorText     = document.getElementById('error-text');
const noticeBar     = document.getElementById('notice-bar');
const noticeText    = document.getElementById('notice-text');

const loginErrorMsg = document.getElementById('login-error-message');
const loginErrorTxt = document.getElementById('login-error-text');

// ── View Helpers ──────────────────────────────────────────────────────────────

function showView(view) {
  viewLoading.hidden   = (view !== 'loading');
  viewLoggedOut.hidden = (view !== 'logged-out');
  viewLoggedIn.hidden  = (view !== 'logged-in');
}

// ── Date Formatting ───────────────────────────────────────────────────────────

/**
 * Formats an ISO 8601 timestamp into a human-readable string.
 * Example: "18 Aug 2026, 10:42 AM"
 *
 * @param {string|null} isoString
 * @returns {string}
 */
function formatSyncTime(isoString) {
  if (!isoString) return 'Never';
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return 'Unknown';
  }
}

// ── Status Rendering ──────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  idle:    { text: 'Up to date',     cssClass: 'status-idle' },
  syncing: { text: 'Syncing scores…', cssClass: 'status-syncing' },
  success: { text: 'Synced!',        cssClass: 'status-success' },
  error:   { text: 'Sync failed',    cssClass: 'status-error' },
};

function renderStatus(status) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  // Remove all status classes, then apply the current one.
  statusBar.className = `status-bar ${config.cssClass}`;
  statusText.textContent = config.text;

  // Sync button state
  const isSyncing = status === 'syncing';
  btnSync.disabled = isSyncing;

  if (isSyncing) {
    syncIcon.classList.add('spinning');
    syncBtnText.textContent = 'Syncing…';
  } else {
    syncIcon.classList.remove('spinning');
    syncBtnText.textContent = 'Sync Scores';
  }
}

function showError(message) {
  errorMessage.hidden = false;
  errorText.textContent = message;
}

function hideError() {
  errorMessage.hidden = true;
  errorText.textContent = '';
}

function showNotice(message) {
  noticeBar.hidden = false;
  noticeText.textContent = message;
}

function hideNotice() {
  noticeBar.hidden = true;
}

// ── State Rendering ───────────────────────────────────────────────────────────

/**
 * Renders the logged-in view with current state data.
 * @param {object} state - State object from service worker GET_STATE response
 */
function renderLoggedInState(state) {
  const { student, lastSyncAt, syncStatus, syncError } = state;

  // Student profile
  if (student) {
    studentName.textContent  = student.name  || 'Student';
    studentEmail.textContent = student.email || '';
  }

  // Last sync time
  lastSyncTime.textContent = formatSyncTime(lastSyncAt);

  // Sync status
  renderStatus(syncStatus || 'idle');

  // Error message
  if (syncStatus === 'error' && syncError) {
    showError(syncError);
  } else {
    hideError();
  }

  // Notice for not-on-page scenario (content script sets this via storage)
  hideNotice();
}

// ── Service Worker Communication ──────────────────────────────────────────────

/**
 * Sends a message to the service worker and returns the response.
 * @param {object} message
 * @returns {Promise<any>}
 */
async function sendToSW(message) {
  return chrome.runtime.sendMessage(message);
}

// ── Initialization ────────────────────────────────────────────────────────────

function initFooter() {
  const currentYear = new Date().getFullYear();
  const footerText = document.getElementById('footer-text');
  if (footerText) {
    footerText.innerHTML = `&copy; ${currentYear} BYT-Bender &bull; All Rights Reserved &bull; v${APP_CONFIG.VERSION}`;
  }
  
  const privacyLinks = document.querySelectorAll('.privacy-link-inline');
  privacyLinks.forEach(link => {
    link.href = APP_CONFIG.PRIVACY_POLICY_URL;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: APP_CONFIG.PRIVACY_POLICY_URL });
    });
  });
}

async function init() {
  showView('loading');
  initFooter();

  try {
    const state = await sendToSW({ type: MSG.GET_STATE });

    if (state?.isAuthenticated) {
      renderLoggedInState(state);
      showView('logged-in');
    } else {
      showView('logged-out');
      if (state?.loginError) {
        loginErrorMsg.hidden = false;
        loginErrorTxt.textContent = state.loginError;
      } else {
        loginErrorMsg.hidden = true;
      }
    }
  } catch (err) {
    // Service worker unavailable (e.g. just installed) — show logged-out.
    showView('logged-out');
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────────

function updateLoginButtonState() {
  if (btnLogin.textContent.includes('Signing in')) return;
  btnLogin.disabled = !(ageCheckbox?.checked && consentCheckbox?.checked && privacyCheckbox?.checked);
}

ageCheckbox?.addEventListener('change', updateLoginButtonState);
consentCheckbox?.addEventListener('change', updateLoginButtonState);
privacyCheckbox?.addEventListener('change', updateLoginButtonState);

btnLogin.addEventListener('click', async () => {
  btnLogin.disabled = true;
  btnLogin.textContent = 'Signing in…';

  try {
    const response = await sendToSW({ type: MSG.AUTH_LOGIN });

    if (response?.success) {
      // Re-fetch full state to render the logged-in view.
      const state = await sendToSW({ type: MSG.GET_STATE });
      renderLoggedInState(state);
      showView('logged-in');
    } else {
      btnLogin.innerHTML = `
        <svg class="google-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
          <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Sign in with Google`;
      
      updateLoginButtonState();

      if (response?.error) {
        loginErrorMsg.hidden = false;
        loginErrorTxt.textContent = response.error;
      }
    }
  } catch (err) {
    // If the popup is closed during auth, this catch fires on reopening.
    // We don't need to do anything here because `init()` handles it.
  }
});

btnSync.addEventListener('click', async () => {
  // Optimistically update UI to syncing state.
  renderStatus('syncing');
  hideError();

  try {
    const response = await sendToSW({ type: MSG.MANUAL_SYNC });

    if (response?.success === false) {
      renderStatus('error');
      showError(response.error || 'Sync failed. Please try again.');
    }
    // If success === true, the sync has started in the background.
    // The UI will update automatically via chrome.storage.onChanged listener.
  } catch (err) {
    renderStatus('error');
    showError('Could not reach the extension service. Try again.');
  }
});

// Listen for storage changes from the background service worker to update UI automatically
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.lastSyncAt || changes.syncStatus || changes.syncError) {
    try {
      const state = await sendToSW({ type: MSG.GET_STATE });
      if (state) {
        lastSyncTime.textContent = formatSyncTime(state.lastSyncAt);
        
        if (changes.lastSyncAt && changes.lastSyncAt.newValue) {
          // A new sync completed successfully! Show success temporarily.
          renderStatus('success');
          hideError();
          setTimeout(() => {
            // Revert to idle after 2s if still showing success
            if (statusBar.classList.contains('status-success')) {
              renderStatus('idle');
            }
          }, 2000);
        } else if (changes.syncStatus && changes.syncStatus.newValue) {
          // Background script changed status (e.g., 'syncing' or 'error')
          renderStatus(changes.syncStatus.newValue);
          if (changes.syncStatus.newValue === 'error') {
            showError(state.syncError || 'Sync failed.');
          } else {
            hideError();
          }
        }
      }
    } catch { /* silent */ }
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await sendToSW({ type: MSG.AUTH_LOGOUT });
  } catch { /* ignore */ }
  showView('logged-out');
});

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
