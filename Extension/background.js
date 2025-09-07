// PhishVault Background Script

// Check if panel is already injected
let injectedTabs = {};

// Store scan results and AI analysis
let currentScanResults = null;
let currentAIAnalysis = null;

// This will be loaded from config.js
let API_KEYS = {};

// Function to load API keys from config.js
async function loadConfig() {
  try {
    // We'll now use a simpler approach by directly importing the script
    // and then accessing the global CONFIG variable

    // Get the API keys from local storage if available
    chrome.storage.local.get(['geminiApiKey', 'secureAPIKeys'], function (result) {
      if (result.geminiApiKey) {
        console.log('Gemini API key found in storage');
        API_KEYS.GEMINI_API_KEY = result.geminiApiKey;
      }

      if (result.secureAPIKeys) {
        console.log('Secure API keys found in storage');
        API_KEYS = { ...API_KEYS, ...result.secureAPIKeys };
      }
    });

    console.log('API keys loaded from storage');

    // Use default Google API key from config if available
    if (typeof CONFIG !== 'undefined' && CONFIG.API_KEYS) {
      API_KEYS.GOOGLE_API_KEY = CONFIG.API_KEYS.GOOGLE_API_KEY || '';
      console.log('Google API key loaded from config');
    }
  } catch (err) {
    console.error('Error loading API keys from config:', err);
    API_KEYS = { GOOGLE_API_KEY: '' }; // Empty fallback
  }

  // Initialize secure storage with the loaded keys
  initializeSecureStorage();
}

// Load config immediately when service worker starts
loadConfig();

// Initialize secure storage of API keys
function initializeSecureStorage() {
  chrome.storage.local.set({ 'secureAPIKeys': API_KEYS }, function () {
    console.log('API keys securely stored');
  });
}

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
  // First inject CSS files
  chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['floatingPanel.css', 'ai-analysis.css']
  }).catch(err => console.error('CSS injection failed:', err));

  // Then inject JS files in order
  // First config.js to define the global CONFIG variable
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['config.js']
  })
    .then(() => {
      // Then inject the main panel script
      return chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['floatingPanel.js']
      });
    })
    .then(() => {
      injectedTabs[tab.id] = true;
      console.log('Successfully injected all scripts');
    })
    .catch(err => console.error('JS injection failed:', err));
}

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  if (injectedTabs[tabId]) {
    delete injectedTabs[tabId];
  }
});

// Initialize API keys on extension installation or update
chrome.runtime.onInstalled.addListener((details) => {
  initializeSecureStorage();
  console.log('PhishVault extension initialized');
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  // Handle different message actions
  switch (message.action) {
    case 'saveScanResults':
      // Save scan results when received from content script
      currentScanResults = message.data;
      console.log('Scan results saved:', currentScanResults);
      sendResponse({ success: true });
      break;

    case 'saveAIAnalysis':
      // Save AI analysis when received
      currentAIAnalysis = message.data;
      console.log('AI analysis saved:', currentAIAnalysis);
      sendResponse({ success: true });
      break;

    case 'getScanResults':
      // Return saved scan results
      sendResponse({
        success: true,
        data: prepareAnalysisData()
      });
      break;

    case 'openAnalysisPage':
      // Open the analysis page in a new tab
      console.log("Opening analysis page...");
      try {
        openAnalysisPage();
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error opening analysis page:", error);
        sendResponse({ success: false, error: error.message });
      }
      break;

    case 'scanCurrentPage':
      // Handle request to scan the current page
      // We'll include risk assessment in the response
      const riskAssessment = determineRiskLevel();
      sendResponse({
        success: true,
        riskAssessment: riskAssessment
      });
      break;

    case 'getAPIKey':
      // Return requested API key
      const keyName = message.keyName || 'GOOGLE_API_KEY';
      chrome.storage.local.get(['secureAPIKeys'], function (result) {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else if (result && result.secureAPIKeys && result.secureAPIKeys[keyName]) {
          sendResponse({ success: true, apiKey: result.secureAPIKeys[keyName] });
        } else {
          sendResponse({ success: false, error: `API key '${keyName}' not found` });
        }
      });
      // Keep the message channel open for the async response
      return true;
      break;
      // Securely provide API key to authorized components
      if (message.keyName && sender.tab) {
        // Only respond to requests from our extension's pages
        chrome.storage.local.get(['secureAPIKeys'], function (result) {
          if (result.secureAPIKeys && result.secureAPIKeys[message.keyName]) {
            sendResponse({
              success: true,
              apiKey: result.secureAPIKeys[message.keyName]
            });
          } else {
            // Try to load config directly if storage failed
            if (API_KEYS[message.keyName]) {
              sendResponse({
                success: true,
                apiKey: API_KEYS[message.keyName]
              });
            } else {
              sendResponse({ success: false, error: 'API key not found' });
            }
          }
        });
        return true; // Required for asynchronous response
      } else {
        sendResponse({ success: false, error: 'Invalid request' });
      }
      break;

    case 'rescanUrl':
      // Handle rescan request
      if (message.url) {
        console.log('Rescan requested for:', message.url);
        // TODO: Implement actual rescan functionality
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No URL provided' });
      }
      break;

    case 'exportPDF':
      // Handle PDF export request
      console.log('Export to PDF requested');
      // TODO: Implement PDF export functionality
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Prepare analysis data by combining scan results and AI analysis
function prepareAnalysisData() {
  if (!currentScanResults) {
    return null;
  }

  // Create a combined data object
  const analysisData = {
    url: currentScanResults.url || currentScanResults.baseUrl,
    timestamp: currentScanResults.timestamp || new Date().getTime(),
    securityScore: calculateSecurityScore(),
    pagesScanned: currentScanResults.pagesVisited?.length || 1,
    formsFound: currentScanResults.summary?.formsFound || 0,
    linksDiscovered: currentScanResults.summary?.linksFound || 0,
    securityIssues: currentScanResults.summary?.findings?.length || 0,
    findings: extractFindings(),
    recommendations: generateRecommendations(),
    technical: extractTechnicalDetails(),
    aiAnalysis: currentAIAnalysis
  };

  return analysisData;
}

// Open the analysis page in a new tab
function openAnalysisPage() {
  const analysisUrl = chrome.runtime.getURL('analysis.html');
  console.log("Analysis page URL:", analysisUrl);

  // Create a new tab with the analysis page
  chrome.tabs.create({
    url: analysisUrl,
    active: true
  }, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error creating tab:", chrome.runtime.lastError);
    } else {
      console.log("Analysis page opened in tab:", tab.id);
    }
  });
}

// Calculate a security score based on findings
function calculateSecurityScore() {
  if (!currentScanResults || !currentScanResults.summary) {
    return 5; // Default middle score
  }

  // Start with a perfect score and deduct for issues
  let score = 10;

  const findings = currentScanResults.summary.findings || [];
  const riskScore = currentScanResults.summary.riskScore || 0;

  // Deduct points based on risk score (0-100)
  if (riskScore > 80) score -= 6;
  else if (riskScore > 60) score -= 4;
  else if (riskScore > 40) score -= 3;
  else if (riskScore > 20) score -= 1;

  // Further adjustments based on number of findings
  if (findings.length > 10) score -= 2;
  else if (findings.length > 5) score -= 1;

  // Ensure score is between 1-10
  return Math.max(1, Math.min(10, Math.round(score)));
}

// Extract findings from scan results
function extractFindings() {
  if (!currentScanResults || !currentScanResults.summary) {
    return [];
  }

  // Map scan findings to a standardized format
  return (currentScanResults.summary.findings || []).map(finding => {
    // Determine severity based on the risk level or category
    let severity = 'Medium';
    if (finding.riskLevel === 'high' || finding.category === 'critical') {
      severity = 'High';
    } else if (finding.riskLevel === 'low' || finding.category === 'info') {
      severity = 'Low';
    }

    return {
      title: finding.title || finding.name || 'Security Issue',
      description: finding.description || 'No description provided',
      severity: severity,
      evidence: finding.evidence || finding.details || null
    };
  });
}

// Generate recommendations based on findings
function generateRecommendations() {
  // Default recommendations if none are available from the scan
  const defaultRecommendations = [
    {
      title: 'Enable HTTPS',
      description: 'Ensure your website uses HTTPS encryption to protect data transmission between users and your server.',
      priority: 'High',
      type: 'ssl'
    },
    {
      title: 'Implement Content Security Policy',
      description: 'Add a Content-Security-Policy header to protect against XSS attacks by specifying which dynamic resources are allowed to load.',
      priority: 'Medium',
      type: 'headers'
    },
    {
      title: 'Use Secure Cookies',
      description: 'Mark cookies with the Secure and HttpOnly flags to prevent them from being accessed by client-side scripts or transmitted over insecure connections.',
      priority: 'Medium',
      type: 'configuration'
    }
  ];

  // TODO: Generate recommendations based on actual findings
  // For now, return default recommendations
  return defaultRecommendations;
}

// Determine the risk level and summary based on scan results and AI analysis
function determineRiskLevel() {
  if (!currentScanResults) {
    return { level: 'unknown', summary: 'No scan data available' };
  }

  // Check findings
  const findings = currentScanResults.summary?.findings || [];
  const highRiskCount = findings.filter(f => f.severity === 'high' || f.severity === 'critical').length;
  const mediumRiskCount = findings.filter(f => f.severity === 'medium').length;
  const lowRiskCount = findings.filter(f => f.severity === 'low' || f.severity === 'info').length;

  // Default summary text
  let summary = '';

  // Determine risk level based on findings
  let level = 'low';
  if (highRiskCount > 0) {
    level = 'high';
    summary = `Found ${highRiskCount} high-risk issue${highRiskCount > 1 ? 's' : ''} requiring immediate attention.`;
  } else if (mediumRiskCount > 2) {
    level = 'high';
    summary = `Found ${mediumRiskCount} medium-risk issues indicating significant security concerns.`;
  } else if (mediumRiskCount > 0) {
    level = 'medium';
    summary = `Found ${mediumRiskCount} medium-risk issue${mediumRiskCount > 1 ? 's' : ''} that should be addressed.`;
  } else if (lowRiskCount > 5) {
    level = 'medium';
    summary = `Found ${lowRiskCount} low-risk issues that collectively represent a moderate concern.`;
  } else if (lowRiskCount > 0) {
    summary = `Found ${lowRiskCount} low-risk issue${lowRiskCount > 1 ? 's' : ''} with minimal security impact.`;
  } else {
    summary = 'No significant security issues detected.';
  }

  // If we have AI analysis, use that to refine the risk assessment
  if (currentAIAnalysis && currentAIAnalysis.securityAssessment) {
    if (currentAIAnalysis.securityAssessment.riskLevel) {
      // AI can override the risk level if it identifies additional concerns
      const aiRiskLevel = currentAIAnalysis.securityAssessment.riskLevel.toLowerCase();
      if ((level === 'low' && (aiRiskLevel === 'medium' || aiRiskLevel === 'high')) ||
        (level === 'medium' && aiRiskLevel === 'high')) {
        level = aiRiskLevel;
        summary = currentAIAnalysis.securityAssessment.summary || summary;
      }
    }
  }

  return { level, summary };
}

// Extract technical details from scan results
function extractTechnicalDetails() {
  if (!currentScanResults) {
    return {};
  }

  // Build technical details object
  const technical = {
    ssl: extractSSLDetails(),
    headers: currentScanResults.headers || {},
    technologies: extractTechnologies()
  };

  return technical;
}

// Extract SSL/TLS details
function extractSSLDetails() {
  if (!currentScanResults || !currentScanResults.ssl) {
    return {
      protocol: 'Unknown',
      certificate: {
        issuer: 'Unknown',
        validUntil: null
      },
      cipher: 'Unknown'
    };
  }

  return currentScanResults.ssl;
}

// Extract technologies used by the website
function extractTechnologies() {
  if (!currentScanResults || !currentScanResults.technologies) {
    return [];
  }

  return currentScanResults.technologies.map(tech => {
    return {
      name: tech.name,
      version: tech.version || null
    };
  });
}
