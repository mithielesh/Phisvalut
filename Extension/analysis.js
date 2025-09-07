// Global variables
let currentAnalysis = null;
let currentUrl = '';
let chatHistory = [];
let scanHistory = [];

// DOM Elements
const sideNav = document.getElementById('sideNav');
const mainContent = document.getElementById('mainContent');
const aiChatView = document.getElementById('aiChatView');
const historyView = document.getElementById('historyView');
const settingsView = document.getElementById('settingsView');
const navItems = document.querySelectorAll('.nav-item');
const globalDarkModeToggle = document.getElementById('globalDarkModeToggle');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('history-search');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Load saved theme preference
    loadThemePreference();
    
    // Load saved settings
    loadSettings();
    
    // Load scan history
    loadScanHistory();
    
    // Setup navigation
    setupNavigation();
    
    // Setup dark mode toggle
    setupDarkModeToggle();
    
    // Setup chat functionality
    setupChat();
    
    // Setup history functionality
    setupHistory();
    
    // Setup settings functionality
    setupSettings();
    
    // Setup tab functionality
    setupTabs();
    
    // Load analysis data if on analysis page
    if (mainContent.style.display !== 'none') {
        loadScanData();
    }
});

// Load theme preference
function loadThemePreference() {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    if (savedDarkMode) {
        document.body.classList.add('dark-mode');
        globalDarkModeToggle.checked = true;
    }
}

// Setup dark mode toggle
function setupDarkModeToggle() {
    globalDarkModeToggle.addEventListener('change', function() {
        if (this.checked) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('darkMode', 'false');
        }
    });
}

// Setup navigation functionality
function setupNavigation() {
    // Navigation item clicks
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
            
            // Get the view to display
            const view = this.getAttribute('data-view');
            
            // Hide all views
            mainContent.style.display = 'none';
            aiChatView.style.display = 'none';
            historyView.style.display = 'none';
            settingsView.style.display = 'none';
            
            // Show the selected view
            switch (view) {
                case 'analysis':
                    mainContent.style.display = 'block';
                    loadScanData();
                    break;
                case 'ai-chat':
                    aiChatView.style.display = 'block';
                    break;
                case 'history':
                    historyView.style.display = 'block';
                    loadScanHistory();
                    break;
                case 'settings':
                    settingsView.style.display = 'block';
                    break;
            }
        });
    });
}

// Setup tab functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
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
}

// Setup chat functionality
function setupChat() {
    // Send message on button click
    sendChatBtn.addEventListener('click', sendMessage);
    
    // Send message on Enter key
    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Send message to AI
function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addChatMessage(message, true);
    chatInput.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    // Simulate AI response (in a real app, this would call an API)
    setTimeout(() => {
        removeTypingIndicator();
        const response = generateAIResponse(message);
        addChatMessage(response, false);
    }, 1500);
}

// Add message to chat
function addChatMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isUser ? 'user-message' : 'ai-message'}`;
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-${isUser ? 'user' : 'robot'}"></i>
        </div>
        <div class="message-content">
            <p>${content}</p>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Add to chat history
    chatHistory.push({
        content: content,
        isUser: isUser,
        timestamp: new Date()
    });
}

// Show typing indicator
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message ai-message typing-message';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove typing indicator
function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Generate AI response (simulated)
function generateAIResponse(message) {
    const responses = [
        "I understand your concern about phishing. Based on the analysis, this website shows several security indicators that suggest it might be attempting to collect sensitive information.",
        "That's a good question. Phishing websites often mimic legitimate sites but have subtle differences in URLs, SSL certificates, or form structures. Our analysis detected some of these patterns.",
        "The security scan found that this website has several form fields that could be used to collect personal information. I recommend being cautious about what data you share on this site.",
        "Based on the technical analysis, this website is missing important security headers like Content-Security-Policy and X-Frame-Options, which makes it more vulnerable to certain types of attacks.",
        "I'd recommend checking the URL carefully for misspellings or unusual domain extensions. Legitimate companies usually have simple, recognizable domain names."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

// Setup history functionality
function setupHistory() {
    // Search functionality
    historySearch.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        filterHistory(searchTerm);
    });
    
    // Clear history button
    clearHistoryBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear all scan history?')) {
            localStorage.removeItem('scanHistory');
            loadScanHistory();
        }
    });
}

// Load scan history
function loadScanHistory() {
    const savedHistory = localStorage.getItem('scanHistory');
    scanHistory = savedHistory ? JSON.parse(savedHistory) : [];
    renderHistory(scanHistory);
}

// Render history list
function renderHistory(history) {
    historyList.innerHTML = '';
    
    if (history.length === 0) {
        historyList.innerHTML = '<p>No scan history available.</p>';
        return;
    }
    
    history.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-item-header">
                <div class="history-url">${item.url}</div>
                <div class="history-date">${formatDate(item.timestamp)}</div>
            </div>
            <div class="history-item-body">
                <div class="history-score">Security Score: <span class="${getScoreClass(item.securityScore)}">${item.securityScore}/10</span></div>
                <div class="history-actions">
                    <button class="history-btn view-btn" data-index="${index}"><i class="fas fa-eye"></i> View</button>
                    <button class="history-btn delete-btn" data-index="${index}"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </div>
        `;
        historyList.appendChild(historyItem);
    });
    
    // Add event listeners for view and delete buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = this.getAttribute('data-index');
            viewScan(history[index]);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = this.getAttribute('data-index');
            deleteScan(index);
        });
    });
}

// Filter history based on search term
function filterHistory(searchTerm) {
    const filtered = scanHistory.filter(item => 
        item.url.toLowerCase().includes(searchTerm)
    );
    renderHistory(filtered);
}

// View a specific scan
function viewScan(scanData) {
    currentAnalysis = scanData;
    currentUrl = scanData.url;
    
    // Switch to analysis view
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector('[data-view="analysis"]').classList.add('active');
    
    mainContent.style.display = 'block';
    aiChatView.style.display = 'none';
    historyView.style.display = 'none';
    settingsView.style.display = 'none';
    
    // Populate the analysis data
    populateAnalysisData(scanData);
}

// Delete a scan from history
function deleteScan(index) {
    scanHistory.splice(index, 1);
    localStorage.setItem('scanHistory', JSON.stringify(scanHistory));
    loadScanHistory();
}

// Setup settings functionality
function setupSettings() {
    saveSettingsBtn.addEventListener('click', saveSettings);
}

// Load settings
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('settings')) || {};
    
    document.getElementById('google-api-key').value = settings.googleApiKey || '';
    document.getElementById('auto-scan').checked = settings.autoScan || false;
    document.getElementById('deep-scan').checked = settings.deepScan || false;
    document.getElementById('notify-high-risk').checked = settings.notifyHighRisk !== false;
    document.getElementById('notify-scan-complete').checked = settings.notifyScanComplete !== false;
    document.getElementById('theme-color').value = settings.themeColor || 'blue';
    
    // Apply theme color
    applyThemeColor(settings.themeColor || 'blue');
}

// Save settings
function saveSettings() {
    const settings = {
        googleApiKey: document.getElementById('google-api-key').value,
        autoScan: document.getElementById('auto-scan').checked,
        deepScan: document.getElementById('deep-scan').checked,
        notifyHighRisk: document.getElementById('notify-high-risk').checked,
        notifyScanComplete: document.getElementById('notify-scan-complete').checked,
        themeColor: document.getElementById('theme-color').value
    };
    
    localStorage.setItem('settings', JSON.stringify(settings));
    
    // Show success message
    const originalText = saveSettingsBtn.innerHTML;
    saveSettingsBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
    saveSettingsBtn.disabled = true;
    
    // Apply theme color
    applyThemeColor(settings.themeColor);
    
    setTimeout(() => {
        saveSettingsBtn.innerHTML = originalText;
        saveSettingsBtn.disabled = false;
    }, 2000);
}

// Apply theme color
function applyThemeColor(color) {
    const root = document.documentElement;
    
    switch(color) {
        case 'purple':
            root.style.setProperty('--primary-color', '#8338ec');
            root.style.setProperty('--secondary-color', '#3a86ff');
            break;
        case 'green':
            root.style.setProperty('--primary-color', '#06ffa5');
            root.style.setProperty('--secondary-color', '#0d7377');
            break;
        case 'red':
            root.style.setProperty('--primary-color', '#ff006e');
            root.style.setProperty('--secondary-color', '#fb5607');
            break;
        default: // blue
            root.style.setProperty('--primary-color', '#3a86ff');
            root.style.setProperty('--secondary-color', '#8338ec');
    }
}

// Load scan data (simulated)
function loadScanData() {
    // Simulate loading data
    setTimeout(() => {
        // Generate mock data
        const mockData = {
            url: 'https://example.com',
            timestamp: new Date(),
            securityScore: Math.floor(Math.random() * 10) + 1,
            pagesScanned: Math.floor(Math.random() * 10) + 1,
            formsFound: Math.floor(Math.random() * 5),
            linksDiscovered: Math.floor(Math.random() * 50) + 10,
            securityIssues: Math.floor(Math.random() * 5),
            findings: [
                {
                    title: 'Missing SSL Certificate',
                    description: 'The website does not use HTTPS, which means data transmitted is not encrypted.',
                    severity: 'High',
                    evidence: 'HTTP protocol used instead of HTTPS'
                },
                {
                    title: 'Suspicious Form Fields',
                    description: 'The website contains form fields that may be used to collect sensitive information.',
                    severity: 'Medium',
                    evidence: 'Form with password field found on homepage'
                }
            ],
            recommendations: [
                {
                    title: 'Implement HTTPS',
                    description: 'Install an SSL certificate to encrypt data transmitted between the user and the server.',
                    type: 'ssl',
                    priority: 'High'
                },
                {
                    title: 'Add Security Headers',
                    description: 'Implement security headers like Content-Security-Policy and X-Frame-Options.',
                    type: 'headers',
                    priority: 'Medium'
                }
            ],
            technical: {
                ssl: {
                    protocol: 'None',
                    certificate: null,
                    validUntil: null,
                    cipher: null
                },
                headers: {
                    'Content-Security-Policy': null,
                    'Strict-Transport-Security': null,
                    'X-Content-Type-Options': null,
                    'X-Frame-Options': null
                },
                technologies: [
                    { name: 'HTML5', version: '5' },
                    { name: 'CSS3', version: '3' },
                    { name: 'JavaScript', version: 'ES6' }
                ]
            }
        };
        
        // Save to scan history
        addToHistory(mockData);
        
        // Populate the UI
        populateAnalysisData(mockData);
    }, 1500);
}

// Add scan to history
function addToHistory(scanData) {
    // Check if already in history
    const exists = scanHistory.some(item => item.url === scanData.url);
    
    if (!exists) {
        scanHistory.unshift(scanData);
        
        // Keep only the last 20 items
        if (scanHistory.length > 20) {
            scanHistory = scanHistory.slice(0, 20);
        }
        
        localStorage.setItem('scanHistory', JSON.stringify(scanHistory));
    }
}

// Populate analysis data to the UI
function populateAnalysisData(data) {
    // Update URL and timestamp
    document.getElementById('analyzed-url').textContent = data.url || 'Unknown URL';
    document.getElementById('scan-timestamp').textContent = `Scan time: ${formatDate(data.timestamp)}`;
    
    // Update security score
    const score = data.securityScore || 0;
    const securityScoreElement = document.getElementById('security-score');
    securityScoreElement.textContent = score;
    securityScoreElement.className = getScoreClass(score);
    document.getElementById('score-label').textContent = getScoreLabel(score);
    
    // Update stats
    document.getElementById('pages-scanned').textContent = data.pagesScanned || 0;
    document.getElementById('forms-found').textContent = data.formsFound || 0;
    document.getElementById('links-discovered').textContent = data.linksDiscovered || 0;
    document.getElementById('security-issues').textContent = data.securityIssues || 0;
    
    // Hide loading and show content
    document.getElementById('loading-analysis').classList.add('hidden');
    document.getElementById('summary-content').classList.remove('hidden');
    
    // Populate tab content
    populateSummaryTab(data);
    populateDetailsTab(data);
    populateRecommendationsTab(data);
    populateTechnicalTab(data);
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

// Helper functions
function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

function getScoreClass(score) {
    if (score <= 3) return 'score-1';
    if (score <= 6) return 'score-4';
    if (score <= 8) return 'score-7';
    return 'score-9';
}

function getScoreLabel(score) {
    if (score <= 3) return 'Critical Risk';
    if (score <= 6) return 'Moderate Risk';
    if (score <= 8) return 'Low Risk';
    return 'Secure';
}

function getOverallRiskClass(score) {
    if (score <= 3) return 'risk-critical';
    if (score <= 6) return 'risk-moderate';
    if (score <= 8) return 'risk-low';
    return 'risk-secure';
}

function getOverallRiskLabel(score) {
    if (score <= 3) return 'Critical Security Risk';
    if (score <= 6) return 'Moderate Security Risk';
    if (score <= 8) return 'Low Security Risk';
    return 'Secure Website';
}

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