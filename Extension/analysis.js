// PhishVault Security Analysis Page Controller

// Helper function to securely get API keys
function getSecureAPIKey(keyName) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'getAPIKey',
            keyName: keyName
        }, function (response) {
            if (response && response.success && response.apiKey) {
                resolve(response.apiKey);
            } else {
                reject(response?.error || 'Failed to retrieve API key');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const themeToggle = document.getElementById('darkModeToggle');
    const loadingContainer = document.getElementById('loading-analysis');
    const summaryContent = document.getElementById('summary-content');
    const analyzedUrlElement = document.getElementById('analyzed-url');
    const scanTimestampElement = document.getElementById('scan-timestamp');
    const securityScoreElement = document.getElementById('security-score');
    const scoreLabelElement = document.getElementById('score-label');
    const copyUrlButton = document.getElementById('copy-url');
    const rescanButton = document.getElementById('rescan-btn');
    const exportPdfButton = document.getElementById('export-pdf-btn');
    const returnButton = document.getElementById('return-btn');

    // Stat elements
    const pagesScannedElement = document.getElementById('pages-scanned');
    const formsFoundElement = document.getElementById('forms-found');
    const linksDiscoveredElement = document.getElementById('links-discovered');
    const securityIssuesElement = document.getElementById('security-issues');

    // Current analysis data
    let currentAnalysis = null;
    let currentUrl = '';

    // Initialize tab functionality
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // Update active tab button
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');

            // Update active tab pane
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');
        });
    });

    // Initialize theme toggle
    themeToggle.addEventListener('change', function () {
        document.body.classList.toggle('dark-mode');

        // Save preference to storage
        chrome.storage.local.set({ 'darkMode': this.checked });
    });

    // Load saved theme preference
    chrome.storage.local.get(['darkMode'], function (result) {
        if (result.darkMode) {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        }
    });

    // Copy URL to clipboard
    copyUrlButton.addEventListener('click', function () {
        const textToCopy = currentUrl;
        navigator.clipboard.writeText(textToCopy).then(function () {
            // Show success tooltip or change icon temporarily
            const originalIcon = copyUrlButton.innerHTML;
            copyUrlButton.innerHTML = '<i class="fas fa-check"></i>';

            setTimeout(() => {
                copyUrlButton.innerHTML = originalIcon;
            }, 1500);
        });
    });

    // Load scan data from background script
    function loadScanData() {
        chrome.runtime.sendMessage({ action: 'getScanResults' }, function (response) {
            if (response && response.data) {
                currentAnalysis = response.data;
                currentUrl = response.data.url || 'Unknown URL';
                hideLoading();
                populateAnalysisData(currentAnalysis);
            } else {
                // Handle case where no data is available
                hideLoading();
                showErrorState('No scan data available. Please return and scan a website first.');
            }
        });
    }

    // Hide loading animation and show content
    function hideLoading() {
        loadingContainer.classList.add('hidden');
        summaryContent.classList.remove('hidden');
    }

    // Show error state
    function showErrorState(message) {
        summaryContent.innerHTML = `
            <div class="error-container">
                <i class="fas fa-exclamation-circle"></i>
                <p>${message}</p>
            </div>
        `;
        summaryContent.classList.remove('hidden');
    }

    // Populate analysis data to the UI
    function populateAnalysisData(data) {
        // Update URL and timestamp
        analyzedUrlElement.textContent = data.url || 'Unknown URL';
        scanTimestampElement.textContent = `Scan time: ${formatDate(data.timestamp)}`;

        // Update security score
        const score = data.securityScore || Math.floor(Math.random() * 10) + 1; // Placeholder
        securityScoreElement.textContent = score;
        securityScoreElement.className = getScoreClass(score);
        scoreLabelElement.textContent = getScoreLabel(score);

        // Update stats
        pagesScannedElement.textContent = data.pagesScanned || 0;
        formsFoundElement.textContent = data.formsFound || 0;
        linksDiscoveredElement.textContent = data.linksDiscovered || 0;
        securityIssuesElement.textContent = data.securityIssues || 0;

        // Populate tab content
        populateSummaryTab(data);
        populateDetailsTab(data);
        populateRecommendationsTab(data);
        populateTechnicalTab(data);
        populateAIAnalysisTab(data);
    }

    // Populate the summary tab content
    function populateSummaryTab(data) {
        const summaryHTML = `
            <h2>Security Analysis Summary</h2>
            <div class="summary-box ${getOverallRiskClass(data.securityScore)}">
                <h3>${getOverallRiskLabel(data.securityScore)}</h3>
                <p>${generateSummaryText(data)}</p>
            </div>
            
            <div class="key-findings">
                <h3>Key Findings</h3>
                <ul>
                    ${generateKeyFindingsList(data.findings || [])}
                </ul>
            </div>
        `;

        document.getElementById('summary-content').innerHTML = summaryHTML;
    }

    // Populate the detailed findings tab
    function populateDetailsTab(data) {
        let detailsHTML = '<h2>Detailed Security Findings</h2>';

        if (!data.findings || data.findings.length === 0) {
            detailsHTML += '<p>No specific security issues were detected.</p>';
        } else {
            detailsHTML += '<div class="findings-list">';
            data.findings.forEach(finding => {
                detailsHTML += `
                    <div class="finding-item ${finding.severity.toLowerCase()}">
                        <div class="finding-header">
                            <h3 class="finding-title">${finding.title}</h3>
                            <span class="severity severity-${finding.severity.toLowerCase()}">${finding.severity}</span>
                        </div>
                        <p>${finding.description}</p>
                        ${finding.evidence ? `<div class="evidence-box"><strong>Evidence:</strong> ${finding.evidence}</div>` : ''}
                    </div>
                `;
            });
            detailsHTML += '</div>';
        }

        document.getElementById('details-content').innerHTML = detailsHTML;
    }

    // Populate the recommendations tab
    function populateRecommendationsTab(data) {
        let recommendationsHTML = '<h2>Security Recommendations</h2>';

        if (!data.recommendations || data.recommendations.length === 0) {
            recommendationsHTML += '<p>No specific recommendations available for this website.</p>';
        } else {
            recommendationsHTML += '<div class="recommendations-list">';
            data.recommendations.forEach(rec => {
                recommendationsHTML += `
                    <div class="recommendation">
                        <div class="recommendation-icon">
                            <i class="fas fa-${getRecommendationIcon(rec.type)}"></i>
                        </div>
                        <div class="recommendation-content">
                            <h3>${rec.title}</h3>
                            <p>${rec.description}</p>
                            <div class="recommendation-priority">
                                <span class="priority-indicator priority-${rec.priority.toLowerCase()}"></span>
                                ${rec.priority} Priority
                            </div>
                        </div>
                    </div>
                `;
            });
            recommendationsHTML += '</div>';
        }

        document.getElementById('recommendations-content').innerHTML = recommendationsHTML;
    }

    // Populate the technical details tab
    function populateTechnicalTab(data) {
        let technicalHTML = '<h2>Technical Details</h2>';

        // Add SSL/TLS information
        technicalHTML += `
            <div class="technical-section">
                <h3>Connection Security</h3>
                <div class="tech-grid">
                    <div class="tech-item">
                        <span class="tech-label">Protocol:</span>
                        <span class="tech-value">${data.technical?.ssl?.protocol || 'Unknown'}</span>
                    </div>
                    <div class="tech-item">
                        <span class="tech-label">Certificate:</span>
                        <span class="tech-value">${data.technical?.ssl?.certificate?.issuer || 'Unknown'}</span>
                    </div>
                    <div class="tech-item">
                        <span class="tech-label">Valid Until:</span>
                        <span class="tech-value">${data.technical?.ssl?.certificate?.validUntil ? formatDate(data.technical.ssl.certificate.validUntil) : 'Unknown'}</span>
                    </div>
                    <div class="tech-item">
                        <span class="tech-label">Encryption:</span>
                        <span class="tech-value">${data.technical?.ssl?.cipher || 'Unknown'}</span>
                    </div>
                </div>
            </div>
        `;

        // Add headers information if available
        if (data.technical?.headers && Object.keys(data.technical.headers).length > 0) {
            technicalHTML += `
                <div class="technical-section">
                    <h3>Security Headers</h3>
                    <div class="headers-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Header</th>
                                    <th>Value</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${generateHeadersTable(data.technical.headers)}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Add technology stack if available
        if (data.technical?.technologies && data.technical.technologies.length > 0) {
            technicalHTML += `
                <div class="technical-section">
                    <h3>Technology Stack</h3>
                    <div class="tech-stack">
                        ${generateTechStackList(data.technical.technologies)}
                    </div>
                </div>
            `;
        }

        document.getElementById('technical-content').innerHTML = technicalHTML;
    }

    // Populate the AI Analysis tab
    function populateAIAnalysisTab(data) {
        const aiContainer = document.getElementById('ai-analysis-container') || document.getElementById('analysis-content');
        if (!aiContainer) return;

        // Show loading indicator
        aiContainer.innerHTML = '<div class="ai-loading"><div class="loading-spinner"></div><p>Generating AI analysis...</p></div>';

        // Get the API key securely
        getSecureAPIKey('GOOGLE_API_KEY')
            .then(apiKey => {
                return performAIAnalysis(data, apiKey);
            })
            .then(aiAnalysis => {
                // Display the AI analysis
                const aiHTML = `
                    <div class="ai-result">
                        <div class="ai-header">
                            <h3>Security Assessment</h3>
                            <div class="ai-badge ${getAIRiskClass(aiAnalysis.riskLevel)}">${aiAnalysis.riskLevel}</div>
                        </div>
                        <div class="ai-summary">
                            <p>${aiAnalysis.summary}</p>
                        </div>
                        <div class="ai-details">
                            <h4>Detailed Analysis</h4>
                            <p>${aiAnalysis.details}</p>
                        </div>
                        <div class="ai-recommendations">
                            <h4>AI Recommendations</h4>
                            <ul>
                                ${aiAnalysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `;
                aiContainer.innerHTML = aiHTML;

                // Save the AI analysis for future reference
                chrome.runtime.sendMessage({
                    action: 'saveAIAnalysis',
                    data: aiAnalysis
                });
            })
            .catch(error => {
                // Handle errors
                aiContainer.innerHTML = `
                    <div class="error-container">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Failed to generate AI analysis: ${error}</p>
                        <button id="retry-ai-btn" class="retry-btn">Retry Analysis</button>
                    </div>
                `;

                // Add retry button functionality
                const retryBtn = aiContainer.querySelector('#retry-ai-btn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => populateAIAnalysisTab(data));
                }
            });
    }

    // Perform AI analysis using the Google Gemini API
    async function performAIAnalysis(data, apiKey) {
        // Example input for the AI model
        const prompt = buildAIPrompt(data);

        try {
            // Call the Google Gemini API
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            const result = await response.json();

            if (!response.ok || !result.candidates || result.candidates.length === 0) {
                throw new Error(result.error?.message || 'Failed to get a response from AI');
            }

            // Parse the AI response
            return parseAIResponse(result.candidates[0].content.parts[0].text);

        } catch (error) {
            console.error('AI analysis error:', error);
            throw error;
        }
    }

    // Build a prompt for the AI based on scan data
    function buildAIPrompt(data) {
        return `
You are a cybersecurity expert analyzing a website. Act as a security professional and give me an assessment of the following website based on the scan results.

Website URL: ${data.url}
Security Issues Found: ${data.securityIssues}
SSL/TLS Information: ${JSON.stringify(data.technical?.ssl || 'Not available')}

Findings:
${data.findings?.map(finding => `- [${finding.severity}] ${finding.title}: ${finding.description}`).join('\n') || 'No specific findings'}

Headers:
${JSON.stringify(data.technical?.headers || 'Not available')}

Based on this information:
1. Determine the overall risk level: Safe, Low Risk, Moderate Risk, or High Risk
2. Write a brief summary of the security status of this website (2-3 sentences)
3. Provide a detailed analysis of the security issues found (paragraph)
4. List 3-5 specific recommendations to improve security

Format your response in JSON structure as follows:
{
  "riskLevel": "One of: Safe, Low Risk, Moderate Risk, High Risk",
  "summary": "Brief summary here",
  "details": "Detailed analysis here",
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}
`;
    }

    // Parse the AI response
    function parseAIResponse(text) {
        try {
            // Extract JSON from the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // Fallback if JSON parsing fails
            return {
                riskLevel: "Unknown",
                summary: "Unable to parse AI response properly.",
                details: text,
                recommendations: ["Please try again with a more detailed scan."]
            };
        } catch (error) {
            console.error('Error parsing AI response:', error);
            return {
                riskLevel: "Error",
                summary: "An error occurred while analyzing the website.",
                details: "The AI analysis could not be completed due to an error in processing the response.",
                recommendations: ["Try scanning the website again.", "Check your connection and try again."]
            };
        }
    }

    // Get CSS class based on AI risk assessment
    function getAIRiskClass(riskLevel) {
        switch (riskLevel) {
            case 'Safe': return 'risk-safe';
            case 'Low Risk': return 'risk-low';
            case 'Moderate Risk': return 'risk-moderate';
            case 'High Risk': return 'risk-high';
            default: return 'risk-unknown';
        }
    }

    // Generate technology stack list
    function generateTechStackList(technologies) {
        let techHTML = '<ul class="tech-list">';

        technologies.forEach(tech => {
            techHTML += `
                <li>
                    <span class="tech-name">${tech.name}</span>
                    ${tech.version ? `<span class="tech-version">v${tech.version}</span>` : ''}
                </li>
            `;
        });

        techHTML += '</ul>';
        return techHTML;
    }

    // Generate headers table
    function generateHeadersTable(headers) {
        let tableHTML = '';

        // Define important security headers to check
        const importantHeaders = {
            'Content-Security-Policy': true,
            'Strict-Transport-Security': true,
            'X-Content-Type-Options': true,
            'X-Frame-Options': true,
            'X-XSS-Protection': true,
            'Referrer-Policy': true
        };

        // First add important headers that are present
        Object.keys(headers).forEach(header => {
            if (importantHeaders[header]) {
                tableHTML += `
                    <tr>
                        <td>${header}</td>
                        <td>${headers[header]}</td>
                        <td class="header-status present"><i class="fas fa-check"></i></td>
                    </tr>
                `;
                delete importantHeaders[header];
            }
        });

        // Then add missing important headers
        Object.keys(importantHeaders).forEach(header => {
            tableHTML += `
                <tr>
                    <td>${header}</td>
                    <td>Not present</td>
                    <td class="header-status missing"><i class="fas fa-times"></i></td>
                </tr>
            `;
        });

        // Then add other headers that are present
        Object.keys(headers).forEach(header => {
            if (!importantHeaders[header]) {
                tableHTML += `
                    <tr>
                        <td>${header}</td>
                        <td>${headers[header]}</td>
                        <td></td>
                    </tr>
                `;
            }
        });

        return tableHTML;
    }

    // Generate key findings list
    function generateKeyFindingsList(findings) {
        if (!findings || findings.length === 0) {
            return '<li>No significant security issues detected</li>';
        }

        // Sort findings by severity (High to Low)
        const sortedFindings = [...findings].sort((a, b) => {
            const severityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

        // Take top 5 findings only
        const topFindings = sortedFindings.slice(0, 5);

        return topFindings.map(finding => {
            return `<li class="key-finding ${finding.severity.toLowerCase()}">${finding.title}</li>`;
        }).join('');
    }

    // Generate a summary text based on the security score
    function generateSummaryText(data) {
        const score = data.securityScore || 5;
        const url = new URL(data.url);
        const domain = url.hostname;

        if (score >= 9) {
            return `${domain} demonstrates strong security practices. The website has implemented most recommended security measures and appears to be well-maintained. Continue monitoring for any changes in security posture.`;
        } else if (score >= 7) {
            return `${domain} has good security overall, but there are some minor issues that could be improved. The website is likely safe to use, but certain security enhancements would further strengthen its defenses.`;
        } else if (score >= 5) {
            return `${domain} has moderate security with some concerning issues identified. While not immediately dangerous, the security gaps could potentially be exploited. Consider addressing these issues before sharing sensitive information.`;
        } else if (score >= 3) {
            return `${domain} has significant security vulnerabilities that require attention. The website shows multiple signs of poor security practices, making it potentially risky for sensitive operations or data sharing.`;
        } else {
            return `${domain} demonstrates critical security issues. This site exhibits multiple severe security problems that could put users at risk. Exercise extreme caution when interacting with this website and avoid sharing any sensitive information.`;
        }
    }

    // Get the appropriate icon for recommendation type
    function getRecommendationIcon(type) {
        const icons = {
            'ssl': 'lock',
            'headers': 'code',
            'authentication': 'user-shield',
            'input': 'keyboard',
            'configuration': 'cogs',
            'content': 'file-alt',
            'network': 'network-wired'
        };

        return icons[type] || 'shield-alt';
    }

    // Format a timestamp to a readable date
    function formatDate(timestamp) {
        if (!timestamp) return 'Unknown';

        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    // Get CSS class based on security score
    function getScoreClass(score) {
        if (score <= 3) return 'score-1';
        if (score <= 6) return 'score-4';
        if (score <= 8) return 'score-7';
        return 'score-9';
    }

    // Get score label based on security score
    function getScoreLabel(score) {
        if (score <= 3) return 'Critical Risk';
        if (score <= 6) return 'Moderate Risk';
        if (score <= 8) return 'Low Risk';
        return 'Secure';
    }

    // Get overall risk class
    function getOverallRiskClass(score) {
        if (score <= 3) return 'risk-critical';
        if (score <= 6) return 'risk-moderate';
        if (score <= 8) return 'risk-low';
        return 'risk-secure';
    }

    // Get overall risk label
    function getOverallRiskLabel(score) {
        if (score <= 3) return 'Critical Security Risk';
        if (score <= 6) return 'Moderate Security Risk';
        if (score <= 8) return 'Low Security Risk';
        return 'Secure Website';
    }

    // Handle rescan button
    rescanButton.addEventListener('click', function () {
        // Send message to trigger a rescan of the current URL
        chrome.runtime.sendMessage({
            action: 'rescanUrl',
            url: currentUrl
        }, function (response) {
            if (response && response.success) {
                // Show loading state again
                summaryContent.classList.add('hidden');
                loadingContainer.classList.remove('hidden');

                // Wait a moment then reload the scan data
                setTimeout(loadScanData, 1000);
            }
        });
    });

    // Handle export PDF button
    exportPdfButton.addEventListener('click', function () {
        chrome.runtime.sendMessage({
            action: 'exportPDF',
            analysisData: currentAnalysis
        });
    });

    // Handle return button
    returnButton.addEventListener('click', function () {
        // Return to the previous page or close the analysis page
        window.close();
    });

    // Initialize the page by loading data
    loadScanData();
});
