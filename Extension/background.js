// Check if panel is already injected
let injectedTabs = {};

chrome.action.onClicked.addListener((tab) => {
  // If already injected in this tab, just toggle the panel
  if (injectedTabs[tab.id]) {
    chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' })
      .catch(err => {
        // If communication fails, re-inject the content
        injectPanel(tab);
      });
    return;
  }

  // Inject the panel for first use
  injectPanel(tab);
});

function injectPanel(tab) {
  chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['floatingPanel.css']
  }).catch(err => console.error('CSS injection failed:', err));

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['floatingPanel.js']
  }).then(() => {
    injectedTabs[tab.id] = true;
  }).catch(err => console.error('JS injection failed:', err));
}

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  if (injectedTabs[tabId]) {
    delete injectedTabs[tabId];
  }
});
