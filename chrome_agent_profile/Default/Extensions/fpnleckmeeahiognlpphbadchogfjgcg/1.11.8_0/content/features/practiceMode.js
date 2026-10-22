// ============================================
// features/practiceMode.js
// Auto-reset code for assignment problems in practice mode
// ============================================

/**
 * Handle Practice Mode - Auto-reset code in assignments
 */
async function handlePracticeMode() {
  if (!isExtensionValid()) return;
  if (!currentSettings["practice-mode"]) return;

  // Check for expiration
  if (currentSettings["practice-mode-start"]) {
    const elapsed = Date.now() - currentSettings["practice-mode-start"];
    const expiryMs =
      (currentSettings["practice-mode-days"] || 7) * 24 * 60 * 60 * 1000;
    if (elapsed > expiryMs) {
      // Auto-disable practice mode
      currentSettings["practice-mode"] = false;
      currentSettings["practice-mode-start"] = null;
      if (isExtensionValid()) {
        chrome.storage.sync.set({ cleanerSettings: currentSettings });
      }
      return;
    }
  }

  if (!location.href.includes("assignment")) return;

  const match = location.pathname.match(
    /\/class\/(\d+)\/assignment\/problems\/(\d+)/,
  );
  if (!match) return;

  const classId = match[1];
  const problemId = match[2];
  const storageKey = `reset_history_${classId}_${problemId}`;

  try {
    const result = await chrome.storage.local.get(storageKey);
    const lastReset = result[storageKey];
    const now = Date.now();
    const fiveHours = 5 * 60 * 60 * 1000;

    const reloadIcon = document.querySelector("i.cr-icon-refresh");
    const reloadBtn = reloadIcon ? reloadIcon.closest("a.tappable") : null;

    if (reloadBtn && !reloadBtn.dataset.resetListener) {
      reloadBtn.addEventListener("click", () => {
        if (isExtensionValid()) {
          chrome.storage.local.set({ [storageKey]: Date.now() });
        }
      });
      reloadBtn.dataset.resetListener = "true";
    }

    if (!lastReset || now - lastReset > fiveHours) {
      if (reloadBtn) {
        // Click the reload button
        reloadBtn.click();

        // Scaler usually shows a confirmation modal. We need to find the "Reset!" button in it.
        // We'll wait a bit for the modal to appear and then look for the confirm button.
        setTimeout(() => {
          if (!isExtensionValid()) return;
          try {
            const modals = document.querySelectorAll(".sr-modal");
            modals.forEach((modal) => {
              if (
                modal.textContent.includes("Are you sure?") ||
                modal.textContent.includes("Reset!") ||
                modal.textContent.includes("Code would be replaced")
              ) {
                const confirmBtn = modal.querySelector(
                  "a.dialog__action.btn-danger",
                );
                if (confirmBtn && confirmBtn.textContent.includes("Reset!")) {
                  confirmBtn.click();
                } else {
                  // Fallback to searching all buttons if the specific selector fails
                  const btns = Array.from(modal.querySelectorAll("button, a"));
                  const resetBtn = btns.find(
                    (b) => b.textContent.trim() === "Reset!",
                  );
                  if (resetBtn) resetBtn.click();
                }
              }
            });
          } catch (e) {
            // Silently fail if context lost
          }
        }, 800);

        // Update storage
        if (isExtensionValid()) {
          await chrome.storage.local.set({ [storageKey]: now });
        }
      } else {
        // If button not found, retry after a short delay (page might still be rendering)
        // Only retry once to avoid infinite loops if the button is truly missing
        if (!window._practiceModeRetry) {
          window._practiceModeRetry = true;
          setTimeout(() => {
            if (!isExtensionValid()) return;
            handlePracticeMode();
            window._practiceModeRetry = false;
          }, 2000);
        }
      }
    }
  } catch (error) {
    if (
      !isExtensionValid() ||
      (error.message && error.message.includes("context invalidated"))
    ) {
      return;
    }
    console.error("[Scaler DOM Cleaner] Error in practice mode:", error);
  }
}
