/**
 * Score Flow — Centralized DOM Selectors
 *
 * ALL CSS selectors for reading the Coursera DOM are defined here.
 * If Coursera changes their DOM structure, this is the ONLY file
 * that needs to be updated.
 *
 * Selector strategy:
 *   - Exact `=`    for stable, fixed data-e2e values (e.g. "grade-pill")
 *   - Prefix `^=`  for dynamic data-e2e values that include text content
 *                  (e.g. "Graded Assignment link Staff Graded Assignment 2")
 *
 * CONFIRMED from DOM analysis (dom.html):
 *   - Recent Grades and Calendar sections both contain the same assignments.
 *   - grade-pill is a fixed, exact attribute value.
 *   - Assignment and course link attributes are dynamic (contain the item name).
 *
 * NOTE: `var` is used intentionally so these constants are accessible as
 * true globals when this file is loaded as a classic content script (injected
 * by Chrome) or via vm.runInThisContext in tests.
 */

var DEBUG = false;

// ─── Section Containers ──────────────────────────────────────────────────────

/** The outer wrapper of the "Recent Grades" list. */
/* jshint -W004 */
/* global */
var SEL_RECENT_GRADES_CONTAINER = '[data-e2e="recent-grades-items-container"]';

/** The outer wrapper of the calendar/timeline events list (desktop). */
var SEL_CALENDAR_CONTAINER = '[data-e2e="calendar-items-container"]';

/** The card showing currently enrolled courses. */
var SEL_CURRENT_COURSES_CARD = '[data-e2e="current-courses-card"]';

// ─── Recent Grades Items ─────────────────────────────────────────────────────

/**
 * Assignment links in the Recent Grades section.
 * data-e2e format: "Graded Assignment link {Assignment Name}"
 * Contains an inner <span> with just the assignment name.
 * Also has an href with the unique Coursera assignment path.
 */
var SEL_RECENT_ASSIGNMENT_LINK = '[data-e2e^="Graded Assignment link"]';

/**
 * Grade display pills. Exact match — this value is always "grade-pill".
 * Text content format: "Grade: {N}%" (e.g. "Grade: 100%", "Grade: 86.66%")
 */
var SEL_GRADE_PILL = '[data-e2e="grade-pill"]';

/**
 * Course name links within Recent Grades items.
 * data-e2e format: "recent-grades-item-course-name-link {Course Name}"
 * Text content is the course name.
 */
var SEL_RECENT_COURSE_LINK = '[data-e2e^="recent-grades-item-course-name-link"]';

// ─── Calendar / Timeline Items ───────────────────────────────────────────────

/**
 * Assignment links in the Calendar section.
 * Same data-e2e prefix as Recent Grades — reusing the same selector is intentional.
 */
var SEL_CALENDAR_ASSIGNMENT_LINK = '[data-e2e^="Graded Assignment link"]';

/**
 * Course name links within Calendar assignment items.
 * data-e2e format: "calendar-list-assignment-item-course-name-link {Course Name}"
 */
var SEL_CALENDAR_COURSE_LINK = '[data-e2e^="calendar-list-assignment-item-course-name-link"]';

// ─── Current Courses ─────────────────────────────────────────────────────────

/**
 * Links to individual current courses.
 * data-e2e format: "current-course-item-link {Course Name}"
 * Text content is the course name.
 */
var SEL_CURRENT_COURSE_LINK = '[data-e2e^="current-course-item-link"]';

// ─── Show More ───────────────────────────────────────────────────────────────

/**
 * The "Show More" button in the Recent Grades section.
 * Exact match — this value does not change.
 */
var SEL_SHOW_MORE_BUTTON = '[data-e2e="show-more-recent-grades-items"]';

// ─── Page Identity ────────────────────────────────────────────────────────────

/**
 * A landmark element on the degree home tab. Used to confirm the correct
 * tab/section is active, not just that the URL matches.
 */
var SEL_DEGREE_HOME_TAB = '[data-e2e="degree-home-tab-link"]';

// ─── Node.js / Jest compatibility ───────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
    SEL_DEGREE_HOME_TAB,
  };
}
