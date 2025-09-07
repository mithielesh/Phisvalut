// AI Security Analysis display component for PhishVault extension
// This should be included in floatingPanel.js

// Function to request AI security analysis
async function requestAISecurityAnalysis(url) {
  try {
    showResult("<em>Requesting AI security analysis...</em>", "loading");
    
    // The base URL for our backend
    const baseUrl = "http://localhost:3000"; // Adjust if needed
    
    const response = await fetch(`${baseUrl}/analyze-security`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    displaySecurityAnalysis(data.securityAnalysis);
    return data;
  } catch (error) {
    console.error("Error getting AI analysis:", error);
    showResult(`<p class="error">Error getting AI analysis: ${error.message}</p>`, "error");
    return null;
  }
}

// Function to display the security analysis
function displaySecurityAnalysis(analysis) {
  // Create a container for the analysis
  const container = document.createElement('div');
  container.className = 'security-analysis';
  
  // Check if we have valid analysis data
  if (!analysis || !analysis.analysis) {
    container.innerHTML = `<p class="error">No valid security analysis available.</p>`;
    result.innerHTML = '';
    result.appendChild(container);
    return;
  }
  
  // Add a header
  const header = document.createElement('h2');
  header.textContent = 'AI Security Analysis';
  container.appendChild(header);
  
  // Add the analysis content - it's already formatted in Markdown
  // We would ideally use a Markdown parser here, but for simplicity
  // we're just replacing some common Markdown elements with HTML
  const formattedAnalysis = analysis.analysis
    .replace(/^# (.*)/gm, '<h2>$1</h2>')
    .replace(/^## (.*)/gm, '<h3>$1</h3>')
    .replace(/^### (.*)/gm, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/<li>(.*)<\/li>/g, '<ul><li>$1</li></ul>')
    .replace(/<\/ul><ul>/g, '');
  
  // Create a div for the content
  const content = document.createElement('div');
  content.className = 'security-analysis-content';
  content.innerHTML = formattedAnalysis;
  
  // Add the scan summary
  const summary = document.createElement('div');
  summary.className = 'security-analysis-summary';
  summary.innerHTML = `
    <h4>Scan Summary</h4>
    <ul>
      <li>URL: ${analysis.scanSummary.url}</li>
      <li>Pages Scanned: ${analysis.scanSummary.pagesScanned}</li>
      <li>Forms Found: ${analysis.scanSummary.formsFound}</li>
      <li>Links Discovered: ${analysis.scanSummary.linksDiscovered}</li>
      <li>Security Issues: ${analysis.scanSummary.securityIssues}</li>
      <li>Scan Date: ${new Date(analysis.scanSummary.scanDate).toLocaleString()}</li>
    </ul>
  `;
  
  // Put it all together
  container.appendChild(content);
  container.appendChild(summary);
  
  // Display in the result area
  result.innerHTML = '';
  result.appendChild(container);
  
  // Make sure the result box is visible
  resultBox.style.display = 'block';
}

// Add button to trigger analysis
function addAIAnalysisButton() {
  // Create the button if it doesn't exist
  if (!document.getElementById('aiAnalysisBtn')) {
    const aiAnalysisBtn = document.createElement('button');
    aiAnalysisBtn.id = 'aiAnalysisBtn';
    aiAnalysisBtn.textContent = ' AI Security Analysis';
    
    // Add icon (Font Awesome)
    const icon = document.createElement('i');
    icon.className = 'fas fa-robot';
    aiAnalysisBtn.prepend(icon);
    
    // Add button after scan buttons
    const scanPageBtn = document.getElementById('scanPageBtn');
    if (scanPageBtn && scanPageBtn.parentNode) {
      scanPageBtn.parentNode.insertBefore(aiAnalysisBtn, scanPageBtn.nextSibling);
    }
    
    // Add click handler
    aiAnalysisBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        requestAISecurityAnalysis(url);
      } else {
        // If no URL is provided, use the current tab URL
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            urlInput.value = tabs[0].url;
            requestAISecurityAnalysis(tabs[0].url);
          } else {
            showResult("<p class='error'>Please enter a URL to analyze</p>", "error");
          }
        });
      }
    });
  }
}

// Add styles for the security analysis
function addSecurityAnalysisStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .security-analysis {
      padding: 15px;
      margin-top: 20px;
      border-radius: 8px;
      background-color: #f8f9fa;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    
    .phishvault-container.dark-mode .security-analysis {
      background-color: #2a2a2a;
      color: #e0e0e0;
    }
    
    .security-analysis h2 {
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
      margin-bottom: 15px;
      color: #2563eb;
    }
    
    .phishvault-container.dark-mode .security-analysis h2 {
      color: #3b82f6;
      border-bottom-color: #444;
    }
    
    .security-analysis h3 {
      margin: 20px 0 10px;
      color: #1e40af;
    }
    
    .phishvault-container.dark-mode .security-analysis h3 {
      color: #60a5fa;
    }
    
    .security-analysis-content {
      line-height: 1.6;
      margin-bottom: 20px;
    }
    
    .security-analysis-summary {
      font-size: 0.9em;
      border-top: 1px solid #ddd;
      margin-top: 20px;
      padding-top: 15px;
    }
    
    .phishvault-container.dark-mode .security-analysis-summary {
      border-top-color: #444;
    }
    
    .security-analysis ul {
      padding-left: 20px;
      margin: 10px 0;
    }
    
    #aiAnalysisBtn {
      background-color: #8b5cf6;
      margin-top: 10px;
    }
    
    #aiAnalysisBtn:hover {
      background-color: #7c3aed;
    }
    
    .phishvault-container.dark-mode #aiAnalysisBtn {
      background-color: #7c3aed;
    }
    
    .phishvault-container.dark-mode #aiAnalysisBtn:hover {
      background-color: #6d28d9;
    }
  `;
  
  document.head.appendChild(style);
}

// Call these functions when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
  addAIAnalysisButton();
  addSecurityAnalysisStyles();
});
