(function () {
  const html = `
    <div class="phishvault-toggle" id="panel-toggle"></div>
    <div class="phishvault-container" id="panel-container">
      <div class="phishvault-header">
        <span>PhishVault</span>
        <span class="phishvault-close" id="panel-close">×</span>
      </div>

      <label for="urlInput">Enter or paste a URL:</label>
      <input type="text" id="urlInput" placeholder="https://example.com" />

      <div class="scan-mode">
        <label for="scanMode">Scan Mode:</label>
        <select id="scanMode">
          <option value="quick">Quick</option>
          <option value="deep">Deep</option>
        </select>
      </div>

      <div class="ai-toggle">
        <input type="checkbox" id="useAI" />
        <label for="useAI">Explain using AI (Gemini)</label>
      </div>

      <div class="darkmode-toggle">
        <input type="checkbox" id="darkModeToggle" />
        <label for="darkModeToggle">Dark Mode</label>
      </div>

      <div class="button-group">
        <button id="scanBtn"> Scan Link</button>
        <button id="scanPageBtn"> Scan This Page</button>
        <button id="analysisBtn" class="analysis-btn">Advanced Analysis</button>
      </div>

      <div id="resultBox" class="hidden">
        <h4>Scan Status:</h4>
        <div id="result"></div>
      </div>
      
      <div id="aiAnalysisContainer" class="ai-analysis-container hidden">
        <div class="ai-analysis-header">
          <h4>Security Risk Analysis</h4>
          <div class="ai-badge">Powered by Gemini</div>
        </div>
        <div id="aiAnalysisSummary" class="ai-summary"></div>
        <div id="aiAnalysisDetails" class="ai-details">
          <div id="aiDetailedFindings"></div>
        </div>
      </div>

      <hr />

      <label for="leakInput"> Check Data Leak (Email / Phone):</label>
      <input type="text" id="leakInput" placeholder="email@example.com or 9876543210" />
      <button id="checkLeakBtn"> Check</button>

      <div id="leakResultBox" class="hidden">
        <h4>Leak Check Result:</h4>
        <div id="leakResult"></div>
      </div>
    </div>
  `;

  // Style & injection
  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = chrome.runtime.getURL("floatingPanel.css");
  document.head.appendChild(styleLink);

  // Add AI analysis styles
  const aiStyleLink = document.createElement("link");
  aiStyleLink.rel = "stylesheet";
  aiStyleLink.href = chrome.runtime.getURL("ai-analysis.css");
  document.head.appendChild(aiStyleLink);

  const containerWrapper = document.createElement("div");
  containerWrapper.innerHTML = html;
  document.body.appendChild(containerWrapper);

  const container = containerWrapper.querySelector('#panel-container');
  const toggleBtn = containerWrapper.querySelector('#panel-toggle');
  const closeBtn = containerWrapper.querySelector('#panel-close');
  const scanBtn = containerWrapper.querySelector('#scanBtn');
  const scanPageBtn = containerWrapper.querySelector('#scanPageBtn');
  const checkLeakBtn = containerWrapper.querySelector('#checkLeakBtn');
  const urlInput = containerWrapper.querySelector('#urlInput');
  const leakInput = containerWrapper.querySelector('#leakInput');
  const scanMode = containerWrapper.querySelector('#scanMode');
  const useAI = containerWrapper.querySelector('#useAI');
  const resultBox = containerWrapper.querySelector('#resultBox');
  const result = containerWrapper.querySelector('#result');
  const leakResultBox = containerWrapper.querySelector('#leakResultBox');
  const leakResult = containerWrapper.querySelector('#leakResult');
  const darkModeToggle = containerWrapper.querySelector('#darkModeToggle');
  const analysisBtn = containerWrapper.querySelector('#analysisBtn');
  const aiAnalysisContainer = containerWrapper.querySelector('#aiAnalysisContainer');
  const aiAnalysisSummary = containerWrapper.querySelector('#aiAnalysisSummary');
  const aiAnalysisDetails = containerWrapper.querySelector('#aiAnalysisDetails');
  const aiDetailedFindings = containerWrapper.querySelector('#aiDetailedFindings');
  const aiRecommendations = containerWrapper.querySelector('#aiRecommendations');

  // Panel visibility state
  let isPanelVisible = localStorage.getItem('phishvaultVisible') === 'true';
  if (isPanelVisible) {
    container.classList.add('active');
  }

  // Toggle panel visibility
  toggleBtn.addEventListener('click', () => {
    container.classList.add('active');
    isPanelVisible = true;
    localStorage.setItem('phishvaultVisible', 'true');
  });

  // Close panel
  closeBtn.addEventListener('click', () => {
    container.classList.remove('active');
    isPanelVisible = false;
    localStorage.setItem('phishvaultVisible', 'false');
  });

  // Dark mode handling
  const darkModeEnabled = localStorage.getItem('phishvaultDarkMode') === 'true';
  if (darkModeEnabled) {
    container.classList.add('dark-mode');
    toggleBtn.classList.add('dark-mode');
    darkModeToggle.checked = true;
  }

  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      container.classList.add('dark-mode');
      toggleBtn.classList.add('dark-mode');
      localStorage.setItem('phishvaultDarkMode', 'true');
    } else {
      container.classList.remove('dark-mode');
      toggleBtn.classList.remove('dark-mode');
      localStorage.setItem('phishvaultDarkMode', 'false');
    }
  });

  function isValidURL(str) {
    try {
      new URL(str);
      return true;
    } catch (_) {
      return false;
    }
  }

  function showResult(message, status = "") {
    console.log("Showing result:", message.substring(0, 100) + "...", status);
    result.innerHTML = message;
    resultBox.classList.remove('hidden', 'success', 'error', 'warn', 'loading');
    resultBox.style.display = 'block';  // Explicitly set display to block
    if (status) resultBox.classList.add(status);
    console.log("Result box display:", resultBox.style.display, "visibility:", resultBox.style.visibility, "classes:", resultBox.className);
  }

  // Function to show AI analysis
  async function showAIAnalysis(analysisData) {
    if (!analysisData || analysisData.error) {
      aiAnalysisSummary.innerHTML = `
        <p class="error">AI analysis failed: ${analysisData?.message || 'Unknown error'}</p>
      `;
      aiAnalysisContainer.classList.remove('hidden');
      aiAnalysisContainer.style.display = 'block';
      return;
    }

    // Extract risk level if available
    const riskLevel = analysisData.riskLevel || 'unknown';
    const riskClass = riskLevel !== 'unknown' ? `risk-${riskLevel}` : '';

    // Fill in the summary with risk level badge and personalized greeting
    const currentTime = new Date();
    const hour = currentTime.getHours();
    
    // Create personalized greeting based on time of day
    let greeting = "Hello";
    if (hour < 12) {
      greeting = "Good morning";
    } else if (hour < 18) {
      greeting = "Good afternoon";
    } else {
      greeting = "Good evening";
    }
    
    // Extract domain name for personalization if available
    let domainName = "";
    try {
      if (analysisData.targetUrl) {
        const url = new URL(analysisData.targetUrl);
        domainName = url.hostname.replace('www.', '');
      }
    } catch (e) {
      console.log("Could not extract domain name");
    }
    
    // Create personalized summary header with Google-like styling
    aiAnalysisSummary.innerHTML = `
      <div class="ai-greeting">${greeting}! Here's your security risk analysis${domainName ? ' for ' + domainName : ''}:</div>
      <div class="ai-summary-header ${riskClass}">
        <span class="risk-badge ${riskClass}">${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk</span>
        ${analysisData.score ? `<span class="score-badge">Score: ${analysisData.score}/10</span>` : ''}
      </div>
      <div class="ai-summary-content">${analysisData.summary || 'No security analysis available'}</div>
    `;

    // Combine details and recommendations (if available) for a comprehensive security analysis
    let fullDetails = '';
    
    if (analysisData.details) {
      fullDetails += analysisData.details;
    }
    
    if (analysisData.recommendations) {
      // Include recommendations as part of security implications
      fullDetails += '\n\n' + analysisData.recommendations;
    }
    
    if (analysisData.technical) {
      // Include technical details if available
      fullDetails += '\n\n' + analysisData.technical;
    }
    
    // Format all the content with better spacing and Google-like styling
    if (fullDetails) {
      const formattedContent = fullDetails
        .split('•')
        .filter(part => part.trim().length > 0)
        .map(part => `<p>${part.trim()}</p>`)
        .join('');
      
      aiDetailedFindings.innerHTML = `
        <div class="section-intro">
          <div class="section-icon">!</div>
          <span>Detailed security analysis</span>
        </div>
        ${formattedContent || fullDetails}
      `;
    } else {
      aiDetailedFindings.innerHTML = '<p><em>No detailed security analysis available</em></p>';
    }    // Show the container
    aiAnalysisContainer.classList.remove('hidden');
    aiAnalysisContainer.style.display = 'block';
  }

  // Directly include the GeminiAnalyzer class definition
  class GeminiAnalyzer {
    constructor(apiKey = null) {
      this.apiKey = apiKey || null;
      // Default endpoint for Gemini 1.5 Flash
      this.endpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
      
      // Check if CONFIG is available and use its values
      if (typeof CONFIG !== 'undefined' && CONFIG.GEMINI && CONFIG.GEMINI.ENDPOINT) {
        console.log('Using endpoint from CONFIG:', CONFIG.GEMINI.ENDPOINT);
        this.endpoint = CONFIG.GEMINI.ENDPOINT;
      }
      
      this.ready = !!this.apiKey;
    }

    async setApiKey(apiKey) {
      this.apiKey = apiKey;
      this.ready = !!this.apiKey;
      return this.ready;
    }

    async getApiKey() {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(['geminiApiKey'], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (result && result.geminiApiKey) {
            this.apiKey = result.geminiApiKey;
            this.ready = true;
            resolve(this.apiKey);
          } else {
            reject(new Error('No API key found in storage'));
          }
        });
      });
    }

    async analyzeSecurity(scanData) {
      try {
        if (!this.ready && !this.apiKey) {
          await this.getApiKey().catch(() => {
            throw new Error('Gemini API key not configured');
          });
        }

        const prompt = this._preparePrompt(scanData);
        const response = await this._callGeminiApi(prompt);
        return this._parseResponse(response);
      } catch (error) {
        console.error('Gemini analysis error:', error);
        return {
          error: true,
          message: `AI analysis failed: ${error.message}`,
          summary: 'Unable to generate AI-powered analysis'
        };
      }
    }

    _preparePrompt(scanData) {
      // Create a focused prompt for security analysis with strong personalization
      
      // Extract URL to personalize the analysis
      let targetUrl = "this website";
      try {
        if (scanData && scanData.url) {
          targetUrl = scanData.url;
        } else if (scanData && scanData.summary && scanData.summary.targetUrl) {
          targetUrl = scanData.summary.targetUrl;
        }
      } catch (e) {
        console.log("Could not extract URL from scan data");
      }
      
      // Determine if this is likely a business or personal site
      let siteType = "this website";
      if (targetUrl) {
        if (targetUrl.includes("bank") || targetUrl.includes("finance") || targetUrl.includes("shop") || 
            targetUrl.includes("store") || targetUrl.includes("commerce") || targetUrl.includes("business")) {
          siteType = "your business website";
        } else if (targetUrl.includes("blog") || targetUrl.includes("personal") || 
                  targetUrl.includes("portfolio") || targetUrl.includes("about.me")) {
          siteType = "your personal website";
        }
      }
      
      return {
        contents: [{
          parts: [{
            text: `You are PhishVault's elite security analyst with years of experience in cybersecurity. Your task is to provide a detailed, comprehensive security risk analysis for ${targetUrl}.
            
  Focus on helping the user understand:
  1. Security vulnerabilities and risks found in ${siteType}
  2. How these vulnerabilities could be exploited by attackers
  3. The real-world consequences and dangers these security issues pose
  4. An overall security risk score that reflects the current security posture
  
  Your analysis should be:
  • COMPREHENSIVE: Cover all security aspects and potential threats in detail
  • TECHNICAL YET ACCESSIBLE: Explain complex security concepts in understandable terms
  • PERSONALIZED: Reference specific elements of ${siteType} in your analysis
  • REALISTIC: Focus on real-world attack scenarios and their consequences
  • PROFESSIONAL: Maintain an authoritative security expert tone
  
  Format your response with these sections:
  - "SUMMARY": A concise overview that explains the security posture. Include risk level (low/medium/high) and a score (X/10). Highlight the most critical security findings.
  - "DETAILS": Provide an in-depth explanation of each security finding, what it means, potential exploit scenarios, and its real-world impact. Be specific and thorough.

  IMPORTANT FORMATTING GUIDELINES:
  • Provide clear, factual information about security risks
  • NO markdown formatting (**, #, etc.)
  • For lists, use "• " (bullet point) at the start of each point
  • Be thorough and specific about security implications
  • Use direct language like "this website has X vulnerability" and "this exposes users to Y risks"
  • For serious issues, be clear about the severity and potential consequences
  • Include technical details where relevant for a comprehensive understanding
  
  Here is the scan data to analyze for ${targetUrl}:
  ${JSON.stringify(scanData, null, 2)}
  `
          }]
        }],
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE"
          }
        ]
      };
    }

    async _callGeminiApi(prompt) {
      const url = `${this.endpoint}?key=${this.apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(prompt)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed: ${response.status} ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        console.error('Gemini API call failed:', error);
        throw error;
      }
    }

    _parseResponse(response) {
      try {
        // Extract the text from Gemini API response
        const text = response.candidates[0].content.parts[0].text;
        
        // Parse sections
        const sections = {
          summary: this._extractSection(text, 'SUMMARY'),
          details: this._extractSection(text, 'DETAILS'),
          recommendations: this._extractSection(text, 'RECOMMENDATIONS'),
          technical: this._extractSection(text, 'TECHNICAL')
        };

        // Process and highlight security terms in the text
        // List of common security terms to highlight
        const securityTerms = [
          'vulnerability', 'exploit', 'malware', 'phishing', 'breach', 'attack', 
          'encryption', 'SSL', 'TLS', 'HTTPS', 'firewall', 'injection', 'XSS', 'CSRF',
          'authentication', 'authorization', 'security headers', 'CSP', 'clickjacking',
          'CORS', 'HSTS', 'certificate', 'secure'
        ];

        // Highlight security terms in the text with span tags
        for (const section in sections) {
          if (sections[section]) {
            securityTerms.forEach(term => {
              // Case insensitive regex with word boundaries to match whole words only
              const regex = new RegExp(`\\b${term}\\b`, 'gi');
              sections[section] = sections[section].replace(
                regex, 
                `<span class="security-term">$&</span>`
              );
            });
            
            // Clean up any markdown artifacts that might have come through
            sections[section] = sections[section]
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
              .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
              .replace(/#{1,6}\s+(.*?)(\n|$)/g, '<strong>$1</strong><br>'); // Headers
          }
        }

        // Store original URL for personalization if available
        let targetUrl = null;
        try {
          if (scanData && scanData.url) {
            targetUrl = scanData.url;
            sections.targetUrl = targetUrl;
          } else if (scanData && scanData.summary && scanData.summary.targetUrl) {
            targetUrl = scanData.summary.targetUrl;
            sections.targetUrl = targetUrl;
          }
        } catch (e) {
          console.log("Could not extract URL from scan data");
        }

        // Clean up markdown artifacts and formatting, and enhance personalization
        for (const key in sections) {
          if (sections[key] && typeof sections[key] === 'string') {
            // Remove ** markdown indicators but preserve the text as HTML bold
            sections[key] = sections[key].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
            // Remove single asterisks for emphasis but preserve as HTML italics
            sections[key] = sections[key].replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            // Remove markdown headers (#, ##, etc)
            sections[key] = sections[key].replace(/^#+\s+/gm, '<strong>');
            
            // Replace numbered list markers with proper HTML
            sections[key] = sections[key].replace(/^\d+\.\s+(.*?)$/gm, '• $1');
            
            // Enhance bullet points with spacing
            sections[key] = sections[key].replace(/•\s+(.*?)(?=$|•)/g, '<div class="bullet-point">• $1</div>');
            
            // Highlight important security terms
            const securityTerms = ['vulnerability', 'risk', 'threat', 'attack', 'malicious', 
                                  'phishing', 'security', 'protection', 'encrypt', 'breach'];
            
            securityTerms.forEach(term => {
              const regex = new RegExp(`\\b(${term}s?|${term.charAt(0).toUpperCase() + term.slice(1)}s?)\\b`, 'g');
              sections[key] = sections[key].replace(regex, '<span class="security-term">$1</span>');
            });
            
            // Add personalized touches to certain sections
            if (key === 'recommendations') {
              sections[key] = sections[key].replace(
                /^/,
                '<div class="personal-note">Here\'s what I recommend specifically for your site:</div>'
              );
            }
          }
        }

        // Extract risk level from summary with improved pattern matching
        let riskLevel = 'unknown';
        
        // Try different patterns to detect risk level
        const riskMatch = sections.summary.match(/risk(?:\s+rating)?(?:\s+is)?(?:\s*:)?\s*(low|medium|high)/i);
        if (riskMatch) {
            riskLevel = riskMatch[1].toLowerCase();
        } else if (sections.summary.match(/\bhigh\s+risk\b/i)) {
            riskLevel = 'high';
        } else if (sections.summary.match(/\bmedium\s+risk\b/i)) {
            riskLevel = 'medium';
        } else if (sections.summary.match(/\blow\s+risk\b/i)) {
            riskLevel = 'low';
        }
        
        // Extract score from summary if available with improved pattern matching
        let score = null;
        const scoreMatch = sections.summary.match(/(\d+(?:\.\d+)?)(?:\s*\/\s*|\s+out\s+of\s+)10/i);
        if (scoreMatch) {
            score = parseFloat(scoreMatch[1]);
        }        return {
          summary: sections.summary,
          details: sections.details,
          recommendations: sections.recommendations,
          technical: sections.technical,
          riskLevel: riskLevel,
          score: score,
          fullText: text
        };
      } catch (error) {
        console.error('Error parsing Gemini response:', error);
        return {
          error: true,
          message: 'Failed to parse AI analysis',
          summary: 'The AI generated a response, but it could not be properly processed.'
        };
      }
    }

    _extractSection(text, sectionName) {
      const regex = new RegExp(`${sectionName}:?\\s*([\\s\\S]*?)(?=(?:SUMMARY|DETAILS|RECOMMENDATIONS|TECHNICAL):?|$)`, 'i');
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    }
  }

  // Function to perform AI analysis with Gemini
  async function performGeminiAnalysis(scanData) {
    try {
      // Create a new Gemini analyzer instance directly
      const geminiAnalyzer = new GeminiAnalyzer();

      // Show loading state
      aiAnalysisSummary.innerHTML = '<p><em>Analyzing with Gemini AI...</em></p>';
      aiAnalysisContainer.classList.remove('hidden');
      aiAnalysisContainer.style.display = 'block';

      // Perform the analysis
      const analysis = await geminiAnalyzer.analyzeSecurity(scanData);

      // Update the UI with the analysis
      showAIAnalysis(analysis);

      return analysis;
    } catch (error) {
      console.error('Error performing Gemini analysis:', error);
      aiAnalysisSummary.innerHTML = `<p class="error">AI analysis failed: ${error.message}</p>`;
      aiAnalysisContainer.classList.remove('hidden');
      return { error: true, message: error.message };
    }
  }

  // Debug function to check API key and configuration
  async function debugGeminiConfig() {
    console.log('Debugging Gemini API configuration:');
    
    // Check if CONFIG is loaded
    if (typeof CONFIG !== 'undefined') {
      console.log('CONFIG object is available');
      console.log('GEMINI CONFIG:', CONFIG.GEMINI);
    } else {
      console.log('CONFIG object is not available');
    }
    
    // Check API key in storage
    chrome.storage.local.get(['geminiApiKey'], function(result) {
      if (result && result.geminiApiKey) {
        const keyLength = result.geminiApiKey.length;
        console.log(`API key found in storage, length: ${keyLength}`);
        console.log(`API key prefix: ${result.geminiApiKey.substring(0, 5)}...`);
      } else {
        console.log('No API key found in storage');
      }
    });
    
    return Promise.resolve();
  }
  
  // Debug Gemini configuration on panel load
  debugGeminiConfig();

  function showLeakResult(message, status = "") {
    leakResult.innerHTML = message;
    leakResultBox.classList.remove('hidden', 'success', 'error', 'warn', 'loading');
    leakResultBox.style.display = 'block';  // Explicitly set display to block
    if (status) leakResultBox.classList.add(status);
  }

  // 🔍 Scan Button (URL)
  scanBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const mode = scanMode.value;
    const aiEnabled = useAI.checked;

    if (!url || !isValidURL(url)) {
      showResult(" <strong>Please enter a valid URL.</strong>", "error");
      return;
    }

    showResult("<em>Scanning the link...</em>", "loading");

    if (mode === 'deep') {
      // Call the deep scan backend
      console.log(`Sending deep scan request for URL: ${url}`);
      try {
        const response = await fetch('http://127.0.0.1:3000/deep-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });

        console.log("Response status:", response.status);
        const data = await response.json();
        console.log("Response data:", JSON.stringify(data, null, 2));
        // Inspect key parts of the data to help with debugging
        console.log("Data structure:", {
          hasSummary: !!data.summary,
          hasAnalysis: !!data.analysis,
          analysisLength: data.analysis ? data.analysis.length : 0,
          analysisType: data.analysis ? typeof data.analysis : 'undefined'
        });

        if (response.ok) {
          // Save scan data to background script for potential later use
          chrome.runtime.sendMessage({
            action: 'saveScanResults',
            data: data
          });

          // Create basic scan summary stats
          let scanSummary = '';
          if (data.summary) {
            scanSummary = `<p>Scan complete: ${data.summary.pagesVisited} pages visited, ${data.summary.formsFound} forms found, ${data.summary.securityIssues} security issues detected.</p>`;
          } else {
            scanSummary = '<p>Scan completed successfully.</p>';
          }

          // Always show scan status
          showResult(scanSummary, "success");

          // If AI explanation is enabled, trigger Gemini analysis
          if (aiEnabled) {
            // Trigger AI analysis immediately
            performGeminiAnalysis(data).then(aiAnalysis => {
              // Save AI analysis to background script
              chrome.runtime.sendMessage({
                action: 'saveAIAnalysis',
                data: aiAnalysis
              });
            }).catch(error => {
              console.error("AI analysis failed:", error);
              showAIAnalysis({
                error: true,
                message: error.message,
                summary: "Failed to analyze security with AI"
              });
            });
          } else {
            // Hide the AI analysis container if AI is not enabled
            aiAnalysisContainer.classList.add('hidden');
          }

          // Add an expandable section for details
          let report = `<details id="analysis-details">`;
          report += `<summary style='cursor:pointer; padding: 8px 0;'>Show detailed analysis</summary>`;
          report += `<div style='margin-top:10px; padding-left: 10px; border-left: 1px solid rgba(255, 255, 255, 0.2);'>`;

          // Add a message if no data is available
          if (!data.analysis || !Array.isArray(data.analysis) || data.analysis.length === 0) {
            report += `<p style='font-style:italic; opacity:0.8;'>No detailed analysis data available.</p>`;
          }

          // Only show the first few items to keep it concise
          console.log("Processing analysis data:", data.analysis);
          if (data.analysis && Array.isArray(data.analysis) && data.analysis.length > 0) {
            const maxItems = Math.min(data.analysis.length, 5);
            report += `<p><em>Found ${data.analysis.length} analyzed items</em></p>`;
            for (let i = 0; i < maxItems; i++) {
              const item = data.analysis[i];
              console.log(`Processing item ${i}:`, item);
              if (item && item.action === 'visit') {
                report += `<p><b>${item.url}</b> - <span class="visited-tag">Visited</span>`;
                report += `<br>Title: ${item.title}`;

                if (item.forms && item.forms.length) {
                  report += `<br>Forms: ${item.forms.length}`;
                }

                if (item.securityFindings && item.securityFindings.length) {
                  const findings = item.securityFindings[0];
                  if (findings.passwordFields > 0) {
                    report += `<br><span class="warning-tag">⚠️ Password fields found</span>`;
                  }
                  if (findings.iframes > 0) {
                    report += `<br><span class="warning-tag">⚠️ ${findings.iframes} iframes detected</span>`;
                  }
                  if (findings.downloadLinks > 0) {
                    report += `<br><span class="warning-tag">⚠️ ${findings.downloadLinks} download links found</span>`;
                  }
                }

                report += `</p>`;
              }
            }

            if (data.analysis.length > maxItems) {
              report += `<p><em>...and ${data.analysis.length - maxItems} more pages analyzed</em></p>`;
            }
          }

          report += `</div>`;
          report += `</details>`;
          report += `</div>`;

          showResult(report, "success");

          // Add a small delay and then add event listener to make details work
          setTimeout(() => {
            const details = document.querySelector('#analysis-details');
            if (details) {
              console.log("Adding click handler to details element");
              const summary = details.querySelector('summary');
              if (summary) {
                summary.addEventListener('click', (e) => {
                  console.log("Summary clicked, toggling details");
                  e.preventDefault();
                  details.toggleAttribute('open');
                });
              }
            }
          }, 200);
        } else {
          showResult(`<strong>Deep scan failed:</strong> ${data.error || "Unknown error."}`, "warn");
          console.error("Deep scan API error:", data);
        }
      } catch (error) {
        console.error("Connection error:", error);
        showResult("<strong>Unable to connect to the scanning server.</strong><br>Make sure the backend server is running at http://127.0.0.1:3000.", "error");
      }
    } else {
      // Quick scan placeholder
      await new Promise(r => setTimeout(r, 1500));
      showResult(`<strong>Scan complete!</strong><br>Mode: ${mode}, AI: ${aiEnabled}`, "success");
    }
  });

  // 🕸️ Scan This Page
  scanPageBtn.addEventListener('click', async () => {
    const pageURL = window.location.href;
    urlInput.value = pageURL;

    // Show loading state
    showResult("<strong>Scanning current page...</strong>", "loading");

    try {
      // Request scan from background script
      chrome.runtime.sendMessage({ action: 'scanCurrentPage', url: pageURL }, (response) => {
        if (response && response.success) {
          // Process scan results
          scanBtn.click();

          // Show risk summary if available
          if (response.riskAssessment) {
            showRiskSummary(response.riskAssessment.level, response.riskAssessment.summary);
          }
        } else {
          console.error("Error scanning page:", response?.error);
        }
      });
    } catch (error) {
      console.error("Error initiating scan:", error);
    }
  });

  // 🔍 Advanced Analysis Button
  if (analysisBtn) {
    analysisBtn.addEventListener('click', () => {
      // Open the advanced analysis page in a new tab
      console.log("Analysis button clicked, sending message to open analysis page");
      chrome.runtime.sendMessage({ action: 'openAnalysisPage' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error opening analysis page:", chrome.runtime.lastError);
        } else if (!response || !response.success) {
          console.error("Failed to open analysis page:", response?.error || "Unknown error");
        } else {
          console.log("Analysis page opening initiated successfully");
        }
      });
    });
  }

  // No toggle buttons needed as we display all content at once
  if (!analysisBtn) {
    console.warn("Advanced Analysis button not found in the DOM");
  }

  // 📱 Check Data Leak
  checkLeakBtn.addEventListener('click', async () => {
    const query = leakInput.value.trim();

    if (!query) {
      showLeakResult(" <strong>Please enter email or phone number.</strong>", "error");
      return;
    }

    showLeakResult(" <em>Checking for data leaks...</em>", "loading");

    // Backend placeholder
    await new Promise(r => setTimeout(r, 2000));
    showLeakResult(` <strong>No known leaks found for:</strong> ${query}`, "success");
  });

  // Listen for messages from background script
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'togglePanel') {
        if (container.classList.contains('active')) {
          container.classList.remove('active');
          localStorage.setItem('phishvaultVisible', 'false');
        } else {
          container.classList.add('active');
          localStorage.setItem('phishvaultVisible', 'true');
        }
      }

      // Handle risk summary display
      if (message.action === 'showRiskSummary') {
        showRiskSummary(message.riskLevel, message.summary);
      }

      // Handle scan results that include risk assessment
      if (message.action === 'scanResult' && message.riskAssessment) {
        // Display the regular scan result
        showResult(message.result, message.status);

        // Also show the risk summary if available
        if (message.riskAssessment.level && message.riskAssessment.summary) {
          showRiskSummary(message.riskAssessment.level, message.riskAssessment.summary);
        }
      }

      return true;
    });
  }

  // Handle keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Close panel on Escape key
    if (e.key === 'Escape' && container.classList.contains('active')) {
      container.classList.remove('active');
      localStorage.setItem('phishvaultVisible', 'false');
    }
  });
})();
