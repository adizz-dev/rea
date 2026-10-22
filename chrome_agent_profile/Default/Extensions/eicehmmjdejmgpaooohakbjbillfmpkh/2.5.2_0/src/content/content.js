/**
 * Score Flow — Content Script
 *
 * Injected by Chrome into Coursera degree home pages (matching the manifest
 * host_permissions pattern). Responsible for:
 *
 *   1. Detecting when the correct page + section is fully rendered
 *   2. Expanding "Show More" to load all available grade history
 *   3. Scraping the rendered DOM (using selectors.js + extractor.js)
 *   4. Normalizing and deduplicating the data (using normalizer.js)
 *   5. Checking the sync cooldown and data hash for change detection
 *   6. Sending the payload to the service worker (which calls the backend)
 *
 * This script makes ZERO network requests to Coursera.
 * Backend API calls are made exclusively by the service worker.
 *
 * The scraper modules (selectors.js, extractor.js, normalizer.js) are
 * loaded before this file via the manifest content_scripts array, making
 * their functions available as globals.
 *
 * Globals available from earlier scripts:
 *   selectors.js: SEL_* constants
 *   extractor.js: extractAll()
 *   normalizer.js: normalizeScrapedData(), computeDataHash()
 *
 * Globals from this script that must also match:
 *   constants.js values are inlined here to avoid module import issues.
 */

'use strict';

// ── Inlined Constants (must match src/utils/constants.js) ─────────────────────
const CS_TARGET_URL_SUBSTRING = 'coursera.org/degrees/bachelor-of-science-computer-science-bits';
const CS_SYNC_COOLDOWN_MS     = 5 * 60 * 1000;  // 5 minutes
const CS_MAX_SHOW_MORE_CLICKS = 20;
const CS_SHOW_MORE_TIMEOUT_MS = 3000;
const CS_DOM_WAIT_TIMEOUT_MS  = 15000;
const CS_DOM_POLL_INTERVAL_MS = 500;
const CS_DOM_STABILITY_MS     = 600;
const CS_DEBUG                = false;

// ── State ─────────────────────────────────────────────────────────────────────
// Guards against double-initialization when the script is injected more than once.
let _isRunning   = false;
let _lastSyncAt  = 0;   // Timestamp of last sync attempt (epoch ms)
let _lastSyncHash = ''; // Hash of data from last sync

// ── Utility ───────────────────────────────────────────────────────────────────

function cs_sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cs_log(...args) {
  if (CS_DEBUG) console.log('[ScoreFlow CS]', ...args);
}

function cs_warn(...args) {
  if (CS_DEBUG) console.warn('[ScoreFlow CS]', ...args);
}

// ── Page Detection ────────────────────────────────────────────────────────────

function cs_isTargetPage() {
  return window.location.href.includes(CS_TARGET_URL_SUBSTRING);
}

// ── DOM Wait Strategies ────────────────────────────────────────────────────────

/**
 * Polls until both the Recent Grades container and the Current Courses
 * container appear with at least one child item, or until the timeout is reached.
 *
 * Uses targeted polling (checking specific elements, not observing everything).
 *
 * @returns {Promise<Element|null>} The grades container element, or null on timeout
 */
async function cs_waitForRequiredContainers() {
  const startTime = Date.now();

  while (Date.now() - startTime < CS_DOM_WAIT_TIMEOUT_MS) {
    const gradesContainer = document.querySelector(SEL_RECENT_GRADES_CONTAINER);
    const hasGrades = gradesContainer && gradesContainer.querySelectorAll(SEL_GRADE_PILL).length > 0;
    
    const coursesContainer = document.querySelector(SEL_CURRENT_COURSES_CARD);
    const hasCourses = coursesContainer && document.querySelectorAll(SEL_CURRENT_COURSE_LINK).length > 0;

    if (hasGrades && hasCourses) {
      cs_log('Grades and Courses containers found with items.');
      return gradesContainer; // Still returning this for the Show More step
    }
    await cs_sleep(CS_DOM_POLL_INTERVAL_MS);
  }

  cs_warn('Required containers did not appear within timeout.');
  return null;
}

/**
 * Waits for the DOM to stop changing within a given container.
 * Checks innerHTML at intervals and resolves when it has been stable
 * for CS_DOM_STABILITY_MS.
 *
 * @param {Element} container
 * @returns {Promise<void>}
 */
async function cs_waitForDomStability(container) {
  let lastHTML = container.innerHTML;
  let stableStart = Date.now();

  while (Date.now() - stableStart < CS_DOM_STABILITY_MS) {
    await cs_sleep(100);
    const currentHTML = container.innerHTML;
    if (currentHTML !== lastHTML) {
      lastHTML = currentHTML;
      stableStart = Date.now(); // reset stability timer
    }
  }
  cs_log('DOM is stable.');
}

// ── Show More Expansion ────────────────────────────────────────────────────────

/**
 * Clicks the "Show More" button repeatedly until all grades are loaded.
 * Uses a targeted MutationObserver per click cycle (not persistent).
 * Stops when: no button found, button not visible, max clicks reached, or timeout.
 *
 * @param {Element} gradesContainer - The recent grades container to observe
 * @returns {Promise<number>} Number of times "Show More" was clicked
 */
async function cs_expandAllRecentGrades(gradesContainer) {
  let clickCount = 0;

  for (let i = 0; i < CS_MAX_SHOW_MORE_CLICKS; i++) {
    const button = document.querySelector(SEL_SHOW_MORE_BUTTON);

    // Stop if button doesn't exist or is hidden.
    if (!button) {
      cs_log(`Show More: No button found after ${clickCount} clicks.`);
      break;
    }

    // Check the button is actually visible (not display:none).
    const style = window.getComputedStyle(button);
    if (style.display === 'none' || style.visibility === 'hidden') {
      cs_log('Show More: Button is hidden. All items loaded.');
      break;
    }

    const previousCount = gradesContainer.querySelectorAll(SEL_GRADE_PILL).length;

    button.click();
    clickCount++;
    cs_log(`Show More: Click #${clickCount}.`);

    // Wait for new items to appear (MutationObserver with timeout fallback).
    await cs_waitForNewGradeItems(gradesContainer, previousCount, CS_SHOW_MORE_TIMEOUT_MS);
  }

  if (clickCount === CS_MAX_SHOW_MORE_CLICKS) {
    cs_warn(`Show More: Reached max clicks (${CS_MAX_SHOW_MORE_CLICKS}). Proceeding with current data.`);
  }

  return clickCount;
}

/**
 * Waits for the number of grade items in the container to increase beyond
 * previousCount, or for the timeout to expire.
 *
 * Uses a targeted MutationObserver on the specific container, disconnected
 * immediately after the condition is met or on timeout.
 *
 * @param {Element} container
 * @param {number} previousCount
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function cs_waitForNewGradeItems(container, previousCount, timeoutMs) {
  return new Promise(resolve => {
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve();
      }
    };

    const observer = new MutationObserver(() => {
      const currentCount = container.querySelectorAll(SEL_GRADE_PILL).length;
      if (currentCount > previousCount) {
        finish();
      }
    });

    // Only observe the grades container — not the entire document.
    observer.observe(container, { childList: true, subtree: true });

    // Fallback: resolve after timeout even if no new items appeared.
    const timeoutId = setTimeout(finish, timeoutMs);
  });
}

// ── Auth & Cooldown ────────────────────────────────────────────────────────────

/**
 * Asks the service worker if the user is authenticated.
 * @returns {Promise<boolean>}
 */
async function cs_isAuthenticated() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, response => {
      if (chrome.runtime.lastError) {
        cs_warn('CHECK_AUTH failed:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      resolve(response?.isAuthenticated === true);
    });
  });
}

/**
 * Returns true if enough time has passed since the last sync.
 * Manual syncs bypass this check (isManual = true).
 */
function cs_shouldSync(isManual = false) {
  if (isManual) return true;
  return Date.now() - _lastSyncAt > CS_SYNC_COOLDOWN_MS;
}

// ── Main Scrape & Sync ─────────────────────────────────────────────────────────

/**
 * The main scraping and sync pipeline.
 *
 * @param {boolean} isManual - True when triggered by the popup "Sync" button
 */
async function cs_runSync(isManual = false) {
  // Guard: prevent concurrent runs.
  if (_isRunning) {
    cs_log('Sync already running. Skipping.');
    return;
  }
  _isRunning = true;

  try {
    // ── Step 1: Check authentication ──────────────────────────────────────
    const authenticated = await cs_isAuthenticated();
    if (!authenticated) {
      cs_log('Not authenticated. Skipping sync.');
      return;
    }

    // ── Step 2: Check cooldown ─────────────────────────────────────────────
    if (!cs_shouldSync(isManual)) {
      cs_log(`Cooldown active. Last sync was ${Math.round((Date.now() - _lastSyncAt) / 1000)}s ago.`);
      return;
    }

    // ── Step 3: Wait for required containers ─────────────────────────────────
    const gradesContainer = await cs_waitForRequiredContainers();
    if (!gradesContainer) {
      cs_warn('Could not find required containers. Page may not have rendered correctly.');
      return;
    }

    // ── Step 4: Expand "Show More" ─────────────────────────────────────────
    const showMoreClicks = await cs_expandAllRecentGrades(gradesContainer);
    cs_log(`Show More expanded ${showMoreClicks} times.`);

    // ── Step 5: Wait for DOM to stabilize ─────────────────────────────────
    await cs_waitForDomStability(gradesContainer);

    // ── Step 6: Scrape the DOM ─────────────────────────────────────────────
    // extractAll() is defined in extractor.js (loaded before this script).
    const rawData = extractAll(document);

    if (!rawData || rawData.rawItems.length === 0) {
      cs_warn('Extraction returned no items. Skipping sync.');
      return;
    }

    // ── Step 7: Normalize and deduplicate ──────────────────────────────────
    // normalizeScrapedData() is defined in normalizer.js.
    const payload = normalizeScrapedData(rawData, window.location.href);

    // Add showMoreClicks to metadata.
    payload.metadata.showMoreClicks = showMoreClicks;

    // ── Step 8: Check data hash for changes ───────────────────────────────
    // computeDataHash() is defined in normalizer.js.
    const currentHash = computeDataHash(payload.assignments);

    if (!isManual && currentHash === _lastSyncHash) {
      cs_log('Data unchanged since last sync. Skipping.');
      return;
    }

    cs_log(`Sending ${payload.assignments.length} assignments for ${payload.currentCourses.length} courses to service worker.`);

    // ── Step 9: Send to service worker ────────────────────────────────────
    chrome.runtime.sendMessage({ type: 'SYNC_DATA', payload }, response => {
      if (chrome.runtime.lastError) {
        cs_warn('SYNC_DATA message failed:', chrome.runtime.lastError.message);
        return;
      }

      if (response?.success) {
        _lastSyncAt   = Date.now();
        _lastSyncHash = currentHash;
        cs_log('Sync reported success by service worker.');
      } else {
        cs_warn('Sync failed:', response?.error);
      }
    });

  } catch (err) {
    cs_warn('Unexpected error during sync pipeline:', err.message);
  } finally {
    _isRunning = false;
  }
}

// ── SPA Navigation Detection ───────────────────────────────────────────────────

/**
 * Detects client-side navigation (SPA) by watching the document title for
 * changes, which is a reliable proxy for route changes on React/Next.js SPAs.
 *
 * When the URL changes back to the target page, re-runs the sync pipeline.
 * Observer is kept alive (low-cost — only watching <title>).
 */
function cs_setupNavigationObserver() {
  let lastUrl = window.location.href;

  const titleEl = document.querySelector('title');
  if (!titleEl) return;

  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (cs_isTargetPage()) {
        cs_log('SPA navigation to target page detected. Re-running sync.');
        // Give the new page time to start rendering before we begin waiting.
        setTimeout(() => cs_runSync(false), 1000);
      }
    }
  });

  observer.observe(titleEl, { childList: true });
  cs_log('SPA navigation observer active.');
}

// ── Message Listener ───────────────────────────────────────────────────────────

/**
 * Listens for TRIGGER_SCRAPE messages from the service worker.
 * These come from the popup's "Sync Scores" button (manual sync).
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TRIGGER_SCRAPE') {
    cs_log('Received TRIGGER_SCRAPE (manual sync).');
    cs_runSync(true).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      cs_warn('TRIGGER_SCRAPE error:', err.message);
      sendResponse({ ok: false, error: err.message });
    });
    return true; // async response
  }
});

// ── Entry Point ────────────────────────────────────────────────────────────────

(function cs_init() {
  cs_log('Content script initialized on:', window.location.href);

  if (!cs_isTargetPage()) {
    // This shouldn't happen because the manifest matches only the target URL,
    // but guard defensively for SPA navigation that might bypass the match.
    cs_log('Not on target page. Exiting.');
    return;
  }

  // Set up SPA navigation watcher first (persistent, low-cost).
  cs_setupNavigationObserver();

  // Also listen for popstate (back/forward navigation).
  window.addEventListener('popstate', () => {
    if (cs_isTargetPage()) {
      cs_log('popstate navigation to target page. Re-running sync.');
      setTimeout(() => cs_runSync(false), 1000);
    }
  });

  // Run initial auto-sync.
  cs_runSync(false);
})();
