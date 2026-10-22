/**
 * Score Flow — Data Normalizer
 *
 * Takes the raw output from extractor.js and produces clean, validated,
 * deduplicated data ready for the backend API.
 *
 * Responsibilities:
 *   1. Trim and normalize all string whitespace.
 *   2. Parse grade text ("Grade: 86.66%") into a numeric value.
 *   3. Deduplicate assignments across Recent Grades and Calendar sections.
 *   4. Extract course slugs from assignment hrefs.
 *   5. Compute a deterministic data hash for change detection.
 *   6. Build the final payload shape for POST /api/sync.
 */

/* global DEBUG */

/**
 * @typedef {object} NormalizedAssignment
 * @property {string} assignmentName   - Clean assignment name
 * @property {string} courseName       - Clean course name
 * @property {number} gradePercentage  - Parsed grade (0–100, allows decimals)
 * @property {string} assignmentHref   - Relative Coursera URL (dedup key)
 * @property {string} source           - 'recent-grades' | 'calendar'
 */

/**
 * @typedef {object} SyncPayload
 * @property {string}   scrapedAt       - ISO 8601 timestamp
 * @property {string}   pageUrl         - Current page URL
 * @property {string[]} currentCourses  - Normalized current course names
 * @property {NormalizedAssignment[]} assignments
 * @property {object}   metadata        - Scraping statistics
 */

// ─── String Normalization ─────────────────────────────────────────────────────

/**
 * Trims leading/trailing whitespace and collapses internal runs of
 * whitespace (spaces, newlines, tabs) to a single space.
 * @param {string} text
 * @returns {string}
 */
function normalizeName(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim().replace(/\s+/g, ' ');
}

// ─── Grade Parsing ────────────────────────────────────────────────────────────

/**
 * Parses a raw grade string from the DOM into a numeric percentage.
 *
 * Expected formats (CONFIRMED from DOM analysis):
 *   "Grade: 100%"    → 100
 *   "Grade: 86.66%"  → 86.66
 *   "Grade: 0%"      → 0
 *
 * Returns null for any unrecognizable or out-of-range value.
 * Invalid items are skipped — not sent to the backend.
 *
 * @param {string} gradeText
 * @returns {number|null}
 */
function parseGrade(gradeText) {
  if (!gradeText || typeof gradeText !== 'string') return null;

  // Strip "Grade: " prefix and "%" suffix, then parse.
  const cleaned = gradeText.trim().replace(/^Grade:\s*/i, '').replace(/%$/, '').trim();

  if (cleaned === '') return null;

  const value = parseFloat(cleaned);

  if (isNaN(value)) return null;
  if (value < 0 || value > 100) {
    if (DEBUG) console.log(`[ScoreFlow] Grade out of range: ${value} (from "${gradeText}")`);
    return null;
  }

  return value;
}

// ─── Course Slug Extraction ────────────────────────────────────────────────────

/**
 * Extracts a course slug from a Coursera assignment href.
 * Example: "/learn/programming-mobile-devices/team/..." → "programming-mobile-devices"
 *
 * @param {string} href
 * @returns {string|null}
 */
function extractCourseSlug(href) {
  if (!href) return null;
  // Coursera assignment URLs follow: /learn/{course-slug}/...
  const match = href.match(/^\/learn\/([^/]+)\//);
  return match ? match[1] : null;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Deduplicates raw grade items using assignmentHref as the primary key.
 *
 * The same assignment appears in both Recent Grades and Calendar sections.
 * Recent Grades items are listed first in rawItems, so they take priority
 * (first-write-wins via Map insertion order).
 *
 * If an item has no href (malformed), falls back to "courseName|assignmentName"
 * as the dedup key.
 *
 * @param {import('./extractor').RawGradeItem[]} rawItems
 * @returns {Map<string, import('./extractor').RawGradeItem>}
 */
function deduplicateItems(rawItems) {
  const seen = new Map();
  let duplicatesRemoved = 0;

  for (const item of rawItems) {
    const key = item.assignmentHref
      ? item.assignmentHref
      : `${normalizeName(item.courseName)}|${normalizeName(item.assignmentName)}`;

    if (seen.has(key)) {
      duplicatesRemoved++;
    } else {
      seen.set(key, item);
    }
  }

  if (DEBUG) console.log(`[ScoreFlow] Dedup: ${duplicatesRemoved} duplicates removed, ${seen.size} unique items`);
  return seen;
}

// ─── Data Hash ────────────────────────────────────────────────────────────────

/**
 * Computes a deterministic hash string from the normalized assignment data.
 * Used to detect whether data has changed since the last sync.
 * Not a cryptographic hash — just a simple, fast string comparison key.
 *
 * @param {NormalizedAssignment[]} assignments
 * @returns {string}
 */
function computeDataHash(assignments) {
  const canonical = assignments
    .map(a => `${a.assignmentHref}|${a.gradePercentage}`)
    .sort() // sort ensures order doesn't affect the hash
    .join('\n');

  // FNV-1a-inspired simple hash (no crypto API needed for this use case).
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    // Multiply by FNV prime, keep within 32-bit unsigned int.
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}

// ─── Master Normalization ─────────────────────────────────────────────────────

/**
 * Takes raw extraction output and produces a clean, validated SyncPayload.
 *
 * @param {{ currentCourses: string[], rawItems: import('./extractor').RawGradeItem[] }} rawData
 * @param {string} pageUrl - Current page URL (from window.location.href)
 * @returns {SyncPayload}
 */
function normalizeScrapedData(rawData, pageUrl) {
  const { currentCourses, rawItems } = rawData;

  const totalItemsScraped = rawItems.length;
  let itemsWithInvalidGrade = 0;

  // Step 1: Deduplicate.
  const dedupMap = deduplicateItems(rawItems);
  const duplicatesRemoved = totalItemsScraped - dedupMap.size;

  // Step 2: Normalize each item and filter out invalid grades.
  const assignments = [];

  for (const [, item] of dedupMap) {
    const gradePercentage = parseGrade(item.gradeText);

    if (gradePercentage === null) {
      itemsWithInvalidGrade++;
      if (DEBUG) console.log(`[ScoreFlow] Skipping item with invalid grade: "${item.gradeText}" for "${item.assignmentName}"`);
      continue;
    }

    assignments.push({
      assignmentName: normalizeName(item.assignmentName),
      courseName: normalizeName(item.courseName),
      gradePercentage,
      assignmentHref: item.assignmentHref,
      courseSlug: extractCourseSlug(item.assignmentHref),
      source: item.source,
    });
  }

  // Step 3: Normalize course names.
  const normalizedCourses = currentCourses
    .map(normalizeName)
    .filter(name => name.length > 0);

  const payload = {
    scrapedAt: new Date().toISOString(),
    pageUrl,
    currentCourses: normalizedCourses,
    assignments,
    metadata: {
      totalItemsScraped,
      duplicatesRemoved,
      itemsWithInvalidGrade,
    },
  };

  if (DEBUG) {
    console.log('[ScoreFlow] Normalized payload:', {
      courses: payload.currentCourses.length,
      assignments: payload.assignments.length,
      metadata: payload.metadata,
    });
  }

  return payload;
}

// ─── Node.js / Jest compatibility ───────────────────────────────────────────
// When loaded as a Chrome content script, `module` is not defined — this block
// is silently skipped. When required by Jest (Node.js), it exports all public
// functions so tests can import them directly without eval/vm gymnastics.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeName,
    parseGrade,
    extractCourseSlug,
    deduplicateItems,
    computeDataHash,
    normalizeScrapedData,
  };
}
