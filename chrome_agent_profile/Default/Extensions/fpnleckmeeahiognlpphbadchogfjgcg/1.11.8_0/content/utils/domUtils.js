// ============================================
// utils/domUtils.js
// Generic DOM helper utilities
// ============================================

/**
 * Helper function to get element by XPath
 */
function getElementByXPath(xpath) {
  return document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue;
}
