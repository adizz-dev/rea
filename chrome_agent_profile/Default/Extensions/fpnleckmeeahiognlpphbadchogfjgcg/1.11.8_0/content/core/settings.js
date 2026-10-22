// ============================================
// core/settings.js
// Settings management and extension state
// ============================================

// Current settings (loaded from storage)
let currentSettings = { ...DEFAULT_SETTINGS };

// Shared state flags
let lastUrl = location.href;
let sidebarObserverSetup = false;
let styleInjected = false;
let modalObserverSetup = false;

/**
 * Check if the extension context is still valid
 */
function isExtensionValid() {
  return (
    typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id
  );
}

/**
 * Load settings from Chrome storage
 */
async function loadSettings() {
  if (!isExtensionValid()) return;
  try {
    const result = await chrome.storage.sync.get("cleanerSettings");
    if (result.cleanerSettings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...result.cleanerSettings };
    }
  } catch (error) {
    // Silently ignore context invalidated error - it's expected when extension updates
    if (error.message && error.message.includes("context invalidated")) {
      return;
    }
    console.error("[Scaler DOM Cleaner] Error loading settings:", error);
    currentSettings = { ...DEFAULT_SETTINGS };
  }
}

/**
 * Check if a feature should hide elements (enabled = hide)
 */
function shouldHide(key) {
  return currentSettings[key] !== false;
}
