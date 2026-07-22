/**
 * FlexyPe Store Diagnostics - Content Script
 * Runs in the isolated content script world; bridges popup ↔ page
 */

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'ok', url: window.location.href });
    return true;
  }
});

// Notify background that the content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: window.location.href });
