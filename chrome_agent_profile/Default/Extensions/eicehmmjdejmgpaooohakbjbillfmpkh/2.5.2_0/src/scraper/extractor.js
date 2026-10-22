/**
 * Score Flow — DOM Extractor
 *
 * Reads the rendered Coursera degree home page DOM and returns raw,
 * un-normalized data structures. This module:
 *   - Makes ZERO network requests.
 *   - Does NOT call the backend.
 *   - Does NOT modify the DOM (except implicitly via Show More clicking,
 *     which is handled by content.js before this module runs).
 *
 * All selectors are imported from selectors.js.
 * Normalization, deduplication, and hashing are done in normalizer.js.
 *
 * POSITIONAL ZIP STRATEGY (see blueprint §5.3):
 *   Within each container, assignment links, grade pills, and course name
 *   links appear in the same positional order. We query all three selector
 *   types and zip them by index. This is simpler and more reliable than
 *   DOM traversal across the complex nested grid structure.
 *
 *   VERIFY: If array lengths are ever mismatched (logged as an error),
 *   fall back to the DOM traversal approach in the scraper.
 */

/* global
  SEL_RECENT_GRADES_CONTAINER,
  SEL_CALENDAR_CONTAINER,
  SEL_CURRENT_COURSES_CARD,
  SEL_RECENT_ASSIGNMENT_LINK,
  SEL_GRADE_PILL,
  SEL_RECENT_COURSE_LINK,
  SEL_CALENDAR_ASSIGNMENT_LINK,
  SEL_CALENDAR_COURSE_LINK,
  SEL_CURRENT_COURSE_LINK,
  SEL_SHOW_MORE_BUTTON,
  DEBUG
*/

/**
 * @typedef {object} RawGradeItem
 * @property {string} assignmentName   - Raw text content (may have extra whitespace)
 * @property {string} assignmentHref   - Relative URL path to the assignment
 * @property {string} gradeText        - Raw text from grade pill (e.g. "Grade: 100%")
 * @property {string} courseName       - Raw course name text
 * @property {string} source           - 'recent-grades' | 'calendar'
 */

/**
 * Extracts raw grade items from a container using the positional zip strategy.
 *
 * @param {Element} container - The DOM container to search within
 * @param {string} assignmentSelector - Selector for assignment links
 * @param {string} courseSelector - Selector for course name links
 * @param {string} source - Label for the data source
 * @returns {RawGradeItem[]}
 */
function extractGradeItemsFromContainer(container, assignmentSelector, courseSelector, source) {
  if (!container) {
    if (DEBUG) console.log(`[ScoreFlow] Container not found for source: ${source}`);
    return [];
  }

  const assignmentLinks = Array.from(container.querySelectorAll(assignmentSelector));
  const gradePills = Array.from(container.querySelectorAll(SEL_GRADE_PILL));
  const courseLinks = Array.from(container.querySelectorAll(courseSelector));

  // Positional alignment check — log a warning if arrays are misaligned.
  // Items without grade pills (upcoming assignments in the calendar) are filtered
  // because the calendar may contain assignments that are due but not yet graded.
  // We use grade pills as the authoritative count since only graded items have them.
  if (DEBUG) {
    console.log(`[ScoreFlow] ${source}: ${assignmentLinks.length} assignments, ${gradePills.length} grade pills, ${courseLinks.length} courses`);
  }

  // Filter assignment links to only those that have an associated grade pill.
  // Strategy: for each grade pill found, find the closest ancestor that also
  // contains an assignment link. This correctly pairs graded items.
  const items = [];

  for (let i = 0; i < gradePills.length; i++) {
    const gradePill = gradePills[i];
    const gradeText = gradePill.textContent || '';

    // Walk up from the grade pill to find the assignment link in the same block.
    // The DOM nests them inside a shared ancestor. We search upward up to 15 levels.
    let assignmentLink = null;
    let courseLink = null;
    let ancestor = gradePill.parentElement;
    let depth = 0;

    while (ancestor && depth < 15) {
      const foundAssignment = ancestor.querySelector(assignmentSelector);
      const foundCourse = ancestor.querySelector(courseSelector);

      if (foundAssignment && foundCourse) {
        assignmentLink = foundAssignment;
        courseLink = foundCourse;
        break;
      }
      ancestor = ancestor.parentElement;
      depth++;
    }

    if (!assignmentLink || !courseLink) {
      if (DEBUG) console.log(`[ScoreFlow] ${source}: Could not find assignment/course pair for grade pill ${i}. Skipping.`);
      continue;
    }

    // Extract assignment name from the inner <span> child (preferred) or from the href/data-e2e.
    const nameSpan = assignmentLink.querySelector('span');
    const rawAssignmentName = nameSpan
      ? nameSpan.textContent
      : extractNameFromDataE2E(assignmentLink, 'Graded Assignment link ');

    const rawCourseName = courseLink.textContent || '';
    const href = assignmentLink.getAttribute('href') || '';

    items.push({
      assignmentName: rawAssignmentName,
      assignmentHref: href,
      gradeText: gradeText,
      courseName: rawCourseName,
      source,
    });
  }

  return items;
}

/**
 * Fallback: extract a name from the data-e2e attribute by removing a known prefix.
 * @param {Element} el
 * @param {string} prefix - The static prefix to strip
 * @returns {string}
 */
function extractNameFromDataE2E(el, prefix) {
  const attr = el.getAttribute('data-e2e') || '';
  return attr.startsWith(prefix) ? attr.slice(prefix.length) : attr;
}

/**
 * Extracts raw grade items from the "Recent Grades" section.
 * @param {Document} doc
 * @returns {RawGradeItem[]}
 */
function extractRecentGrades(doc) {
  const container = doc.querySelector(SEL_RECENT_GRADES_CONTAINER);
  return extractGradeItemsFromContainer(
    container,
    SEL_RECENT_ASSIGNMENT_LINK,
    SEL_RECENT_COURSE_LINK,
    'recent-grades'
  );
}

/**
 * Extracts raw grade items from the calendar/timeline section.
 * The calendar contains the same assignments plus future events — we only
 * capture items that have a grade pill (i.e., already graded).
 * @param {Document} doc
 * @returns {RawGradeItem[]}
 */
function extractCalendarGrades(doc) {
  const container = doc.querySelector(SEL_CALENDAR_CONTAINER);
  return extractGradeItemsFromContainer(
    container,
    SEL_CALENDAR_ASSIGNMENT_LINK,
    SEL_CALENDAR_COURSE_LINK,
    'calendar'
  );
}

/**
 * Extracts the list of currently enrolled course names.
 * @param {Document} doc
 * @returns {string[]} Array of raw course name strings
 */
function extractCurrentCourses(doc) {
  const card = doc.querySelector(SEL_CURRENT_COURSES_CARD);
  if (!card) {
    if (DEBUG) console.log('[ScoreFlow] Current courses card not found.');
    return [];
  }

  const courseLinks = Array.from(card.querySelectorAll(SEL_CURRENT_COURSE_LINK));
  return courseLinks.map(link => link.textContent || '');
}

/**
 * Master extraction function. Combines recent grades and calendar grades.
 * Does NOT deduplicate — that is done in normalizer.js.
 *
 * @param {Document} doc - The page document
 * @returns {{ currentCourses: string[], rawItems: RawGradeItem[] }}
 */
function extractAll(doc) {
  const currentCourses = extractCurrentCourses(doc);
  const recentItems = extractRecentGrades(doc);
  const calendarItems = extractCalendarGrades(doc);

  // Combine: recent grades first (they take priority in dedup step).
  const rawItems = [...recentItems, ...calendarItems];

  if (DEBUG) {
    console.log(`[ScoreFlow] Extraction complete: ${currentCourses.length} courses, ${rawItems.length} raw items (before dedup)`);
  }

  return { currentCourses, rawItems };
}

// ─── Node.js / Jest compatibility ───────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractGradeItemsFromContainer,
    extractRecentGrades,
    extractCalendarGrades,
    extractCurrentCourses,
    extractAll,
  };
}
