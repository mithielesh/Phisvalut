// Enhanced crawler for general websites
const express = require('express');
const cors = require('cors');
const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

// Server configuration
const CONFIG = {
    port: 3000,
    headless: false,  // Always run in visible mode to see browser activity
    slowMo: 100,      // Add delay between actions (ms)
    maxDepth: 5,      // Maximum depth for crawling
    maxLinksPerPage: 25, // Maximum links to follow per page
    scanTimeout: 240000, // 4-minute timeout
    
    // Rate limiting configuration
    rateLimit: {
        enabled: true,
        requestsPerMinute: 15, // Maximum requests per minute
        delayBetweenRequests: 2000, // Base delay between requests (ms)
        jitter: 500, // Random jitter to add to delay (ms)
        domainDelays: {} // Track last request time per domain
    },
    
    // Enhanced JavaScript handling
    jsHandling: {
        waitForAngular: true,
        waitForReact: true,
        waitForJQuery: true,
        waitForDynamicContent: true,
        maxWaitTime: 15000, // Maximum time to wait for dynamic content (ms)
        retryAttempts: 3,
        retryDelay: 1000 // Delay between retries (ms)
    },
    
    formFillPatterns: {
        // Common input fields and what to fill them with
        'email': 'test@example.com',
        'username': 'testuser',
        'password': 'password123',
        'name': 'Test User',
        'firstName': 'Test',
        'lastName': 'User',
        'phone': '1234567890',
        'address': '123 Test St',
        'city': 'Testville',
        'zip': '12345',
        'search': 'security test',
        'comment': 'This is an automated security test',
        'question': 'How secure is my account information?',
        'subject': 'Security Question',
        'message': 'This is a test message to check form security.',
        'feedback': 'This site needs better security measures.',
        'amount': '100',
        // Add more patterns as needed
        'cardNumber': '4111111111111111', // Test credit card number (Visa)
        'cvv': '123',
        'expMonth': '12',
        'expYear': '2030'
    },
    
    // Extra configuration for more thorough crawling
    clickableElements: [
        'button',
        'input[type="button"]',
        'input[type="submit"]',
        '.btn',
        '.button',
        'a.nav-link',
        '[role="button"]',
        '[role="tab"]',
        '.menu-item',
        '.clickable',
        '.card-header[data-toggle="collapse"]',
        '.accordion-button',
        '.accordion-header',
        '.nav-link',
        '.page-link',
        '[data-toggle="tab"]',
        '[data-bs-toggle]'
    ],
    
    // Form processing settings
    autoCloseDialogs: true, // Whether to automatically close dialogs after form submission
    checkIframes: true, // Whether to check for forms inside iframes
    fillAllFieldsInForm: true, // Try to fill all fields in a form, not just the required ones
    submitAllForms: true, // Try to submit all forms found, not just ones we recognize
    
    // Enhanced form detection
    formDetection: {
        detectHiddenForms: true,
        detectDynamicForms: true,
        detectShadowDOM: true,
        waitTimeAfterInteraction: 2000, // Time to wait after interaction for dynamic forms to appear (ms)
        maxFormDetectionAttempts: 3
    }
};

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Store all activity logs for analysis
const activityLogs = [];

// Rate limiting function
async function applyRateLimit(url) {
    if (!CONFIG.rateLimit.enabled) return;
    
    const domain = new URL(url).hostname;
    const now = Date.now();
    const lastRequest = CONFIG.rateLimit.domainDelays[domain] || 0;
    const timeSinceLastRequest = now - lastRequest;
    
    // Calculate required delay
    const minDelay = CONFIG.rateLimit.delayBetweenRequests;
    const jitter = Math.floor(Math.random() * CONFIG.rateLimit.jitter);
    const requiredDelay = Math.max(0, minDelay - timeSinceLastRequest) + jitter;
    
    if (requiredDelay > 0) {
        console.log(`Rate limiting: Waiting ${requiredDelay}ms before requesting ${url}`);
        await new Promise(resolve => setTimeout(resolve, requiredDelay));
    }
    
    // Update last request time
    CONFIG.rateLimit.domainDelays[domain] = Date.now();
}

// Enhanced JavaScript waiting function
async function waitForJavaScript(driver, url) {
    if (!CONFIG.jsHandling.waitForDynamicContent) return;
    
    const waitForCondition = async (condition, description, maxAttempts = CONFIG.jsHandling.retryAttempts) => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await driver.executeScript(condition);
                if (result) return true;
            } catch (e) {
                // Ignore errors and retry
            }
            
            if (attempt < maxAttempts) {
                console.log(`Waiting for ${description}... (attempt ${attempt}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.jsHandling.retryDelay));
            }
        }
        return false;
    };
    
    // Wait for document ready
    await driver.wait(async () => {
        return await driver.executeScript('return document.readyState === "complete"');
    }, CONFIG.jsHandling.maxWaitTime);
    
    // Wait for jQuery if present
    if (CONFIG.jsHandling.waitForJQuery) {
        await waitForCondition(
            'return typeof jQuery === "undefined" || jQuery.active === 0',
            'jQuery AJAX requests'
        );
    }
    
    // Wait for Angular if present
    if (CONFIG.jsHandling.waitForAngular) {
        await waitForCondition(
            `return typeof angular === 'undefined' || 
                   angular.element(document).injector().get('$http').pendingRequests.length === 0`,
            'Angular HTTP requests'
        );
    }
    
    // Wait for React if present
    if (CONFIG.jsHandling.waitForReact) {
        await waitForCondition(
            `return typeof document.querySelector === 'undefined' || 
                   document.querySelector('[data-reactroot]') === null || 
                   window.performance.getEntriesByType('measure').filter(e => e.name.startsWith('React')).length === 0`,
            'React rendering'
        );
    }
    
    // Wait for general dynamic content
    await new Promise(resolve => setTimeout(resolve, 1000));
}

// Helper function to normalize URLs for consistent comparison
function normalizeUrl(inputUrl) {
    try {
        const parsedUrl = new URL(inputUrl);
        
        // Remove common tracking parameters
        const searchParams = parsedUrl.searchParams;
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
         'fbclid', 'gclid', 'msclkid', 'zanpid', 'ref', '_ga'].forEach(param => {
            searchParams.delete(param);
        });
        
        // Normalize protocol (http vs https doesn't make it a different page for our purposes)
        // But keep the port since it could be different applications
        let normalized = `${parsedUrl.hostname}${parsedUrl.port ? ':' + parsedUrl.port : ''}${parsedUrl.pathname}`;
        
        // Add back the search params if any exist
        const search = searchParams.toString();
        if (search) {
            normalized += '?' + search;
        }
        
        // Remove trailing slashes and normalize case
        return normalized.toLowerCase().replace(/\/+$/, '');
    } catch (e) {
        // If URL parsing fails, return the original URL
        return inputUrl;
    }
}

// Enhanced form detection
async function detectAllForms(driver, url) {
    let forms = [];
    let attempts = 0;
    
    // First try: Standard form detection
    try {
        const standardForms = await driver.findElements(By.tagName('form'));
        forms = forms.concat(standardForms);
    } catch (e) {
        console.log(`Error detecting standard forms: ${e.message}`);
    }
    
    // Second try: Look for form-like containers
    if (CONFIG.formDetection.detectHiddenForms || CONFIG.formDetection.detectDynamicForms) {
        try {
            const formLikeContainers = await driver.executeScript(`
                const containers = [];
                
                // Find all divs that might contain forms
                const allDivs = document.querySelectorAll('div');
                allDivs.forEach(div => {
                    const inputs = div.querySelectorAll('input, textarea, select');
                    if (inputs.length > 0) {
                        containers.push(div);
                    }
                });
                
                // Find all sections that might contain forms
                const allSections = document.querySelectorAll('section');
                allSections.forEach(section => {
                    const inputs = section.querySelectorAll('input, textarea, select');
                    if (inputs.length > 0) {
                        containers.push(section);
                    }
                });
                
                return Array.from(containers).map(el => ({
                    id: el.id || '',
                    className: el.className || '',
                    tagName: el.tagName
                }));
            `);
            
            // Convert these to elements
            for (const container of formLikeContainers) {
                try {
                    let element = null;
                    
                    // Try to find by ID first
                    if (container.id) {
                        element = await driver.findElement(By.id(container.id)).catch(() => null);
                    }
                    
                    // If not found by ID, try by class name
                    if (!element && container.className) {
                        element = await driver.findElement(By.className(container.className)).catch(() => null);
                    }
                    
                    // If still not found, try by tag name and position
                    if (!element) {
                        const elements = await driver.findElements(By.tagName(container.tagName));
                        if (elements.length > 0) {
                            element = elements[0];
                        }
                    }
                    
                    if (element) {
                        forms.push(element);
                    }
                } catch (e) {
                    console.log(`Error detecting form-like container: ${e.message}`);
                }
            }
        } catch (e) {
            console.log(`Error finding form-like containers: ${e.message}`);
        }
    }
    
    // Third try: Look for forms in shadow DOM
    if (CONFIG.formDetection.detectShadowDOM) {
        try {
            const shadowForms = await driver.executeScript(`
                const shadowForms = [];
                
                // Function to check shadow roots
                function checkShadowRoot(root) {
                    if (!root) return;
                    
                    // Find forms in this shadow root
                    const forms = root.querySelectorAll('form');
                    forms.forEach(form => shadowForms.push(form));
                    
                    // Recursively check shadow roots in this shadow root
                    const allElements = root.querySelectorAll('*');
                    allElements.forEach(el => {
                        if (el.shadowRoot) {
                            checkShadowRoot(el.shadowRoot);
                        }
                    });
                }
                
                // Start with document element
                checkShadowRoot(document.documentElement);
                
                return shadowForms.length;
            `);
            
            console.log(`Found ${shadowForms} forms in shadow DOM`);
        } catch (e) {
            console.log(`Error checking shadow DOM: ${e.message}`);
        }
    }
    
    // If no forms found and we're configured to detect dynamic forms, try interacting with the page
    if (forms.length === 0 && CONFIG.formDetection.detectDynamicForms && attempts < CONFIG.formDetection.maxFormDetectionAttempts) {
        attempts++;
        console.log(`No forms found, attempting to trigger dynamic forms (attempt ${attempts}/${CONFIG.formDetection.maxFormDetectionAttempts})`);
        
        // Try clicking on common elements that might reveal forms
        const clickableSelectors = [
            '.login-btn', '.signin-btn', '.register-btn', '.signup-btn',
            '.contact-btn', '.feedback-btn', '.search-btn', '.menu-btn',
            '[data-toggle="modal"]', '[data-target="#login"]', '[data-target="#signin"]'
        ];
        
        for (const selector of clickableSelectors) {
            try {
                const elements = await driver.findElements(By.css(selector));
                if (elements.length > 0) {
                    console.log(`Clicking ${selector} to reveal forms`);
                    await elements[0].click();
                    await new Promise(resolve => setTimeout(resolve, CONFIG.formDetection.waitTimeAfterInteraction));
                    
                    // Check for forms again
                    const newForms = await driver.findElements(By.tagName('form'));
                    if (newForms.length > 0) {
                        forms = forms.concat(newForms);
                        break;
                    }
                }
            } catch (e) {
                console.log(`Error clicking ${selector}: ${e.message}`);
            }
        }
    }
    
    console.log(`Detected ${forms.length} forms total`);
    return forms;
}

// Helper function to categorize links
function categorizeLink(link) {
    const url = link.url || '';
    const text = (link.text || '').toLowerCase();
    
    // Security-sensitive links
    if (url.includes('login') || text.includes('login') || text.includes('sign in')) {
        return 'authentication';
    }
    if (url.includes('admin') || text.includes('admin')) {
        return 'administrative';
    }
    if (url.includes('payment') || url.includes('checkout') || text.includes('payment') || text.includes('checkout')) {
        return 'payment';
    }
    if (url.includes('account') || text.includes('account') || text.includes('profile')) {
        return 'account';
    }
    if (url.includes('download') || text.includes('download')) {
        return 'download';
    }
    
    // Default category
    return 'general';
}

// Helper function to analyze page security
async function analyzePageSecurity(driver, url) {
    try {
        // Check security headers
        const securityHeaders = await driver.executeScript(`
            // Get security headers from performance API
            const performance = window.performance || {};
            const entries = performance.getEntriesByType ? performance.getEntriesByType('navigation') : [];
            
            // Check for CSP in meta tags
            const hasCspMetaTag = document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null;
            
            return {
                url: document.location.href,
                protocol: document.location.protocol,
                hasMixedContent: document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]').length > 0,
                hasCspMetaTag: hasCspMetaTag,
                hasPasswordFieldsOnPage: document.querySelectorAll('input[type="password"]').length > 0
            };
        `);
        
        // Look for potentially dangerous JS
        const jsSecurityIssues = await driver.executeScript(`
            // Check for inline event handlers
            const inlineEventHandlers = document.querySelectorAll('[onclick], [onmouseover], [onload]').length;
            
            // Check for eval usage
            const scriptTags = Array.from(document.querySelectorAll('script'));
            const scriptContent = scriptTags.map(script => script.textContent).join(' ');
            const hasEval = scriptContent.includes('eval(');
            
            // Check for document.write
            const hasDocWrite = scriptContent.includes('document.write(');
            
            return {
                inlineEventHandlers,
                hasEval,
                hasDocWrite
            };
        `);
        
        return {
            ...securityHeaders,
            ...jsSecurityIssues,
            isHttps: url.startsWith('https://'),
            timestamp: new Date().toISOString()
        };
    } catch (e) {
        console.log(`Error analyzing page security: ${e.message}`);
        return {
            error: e.message,
            isHttps: url.startsWith('https://')
        };
    }
}

// Root endpoint for testing
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        message: 'Crawler server is running. Use POST /deep-scan to initiate a scan.',
        timestamp: new Date().toISOString()
    });
});

// Simple helper for safe element operations
async function safeOperation(operation, defaultValue = null) {
    try {
        return await operation();
    } catch (e) {
        return defaultValue;
    }
}

// Enhanced form field filling function
async function fillFormField(driver, field, valueToUse, fieldType) {
    try {
        // Check if the field is visible and enabled
        const isVisible = await field.isDisplayed();
        const isEnabled = await field.isEnabled();
        
        if (!isVisible || !isEnabled) {
            console.log(`Field is not visible or enabled, skipping`);
            return false;
        }
        
        // Get field details
        const tagName = await field.getTagName();
        const inputType = await field.getAttribute('type');
        
        // Handle different field types
        if (tagName === 'select') {
            // Handle select dropdown
            const options = await field.findElements(By.tagName('option'));
            if (options.length > 0) {
                // Try to find an option by value or text
                let optionFound = false;
                for (const option of options) {
                    const optionValue = await option.getAttribute('value');
                    const optionText = await option.getText();
                    
                    if (optionValue && optionValue.toLowerCase().includes(valueToUse.toLowerCase())) {
                        await option.click();
                        optionFound = true;
                        break;
                    } else if (optionText && optionText.toLowerCase().includes(valueToUse.toLowerCase())) {
                        await option.click();
                        optionFound = true;
                        break;
                    }
                }
                
                // If no matching option found, select the first non-empty option
                if (!optionFound) {
                    for (const option of options) {
                        const optionValue = await option.getAttribute('value');
                        const optionText = await option.getText();
                        if (optionValue && optionValue.trim() !== '' && 
                            !optionText.toLowerCase().includes('select') && 
                            !optionText.toLowerCase().includes('choose')) {
                            await option.click();
                            optionFound = true;
                            break;
                        }
                    }
                }
                
                // If still no option found, select the second option (skip placeholder)
                if (!optionFound && options.length > 1) {
                    await options[1].click();
                }
            }
        } else if (inputType === 'checkbox' || inputType === 'radio') {
            // Handle checkbox and radio buttons
            const isSelected = await field.isSelected();
            if (inputType === 'checkbox') {
                // For checkbox, we want to check it if it's unchecked
                if (!isSelected) {
                    await field.click();
                }
            } else {
                // For radio, we just click to select
                await field.click();
            }
        } else if (tagName === 'textarea' || inputType === 'text' || inputType === 'password' || inputType === 'email' || inputType === 'tel' || inputType === 'number') {
            // Clear the field first
            await field.clear();
            
            // Use JavaScript to set the value and trigger events
            await driver.executeScript(`
                const field = arguments[0];
                const value = arguments[1];
                
                // Clear the field
                field.value = '';
                
                // Set the new value
                field.value = value;
                
                // Trigger events to ensure frameworks detect the change
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('blur', { bubbles: true }));
            `, field, valueToUse);
        } else {
            // For other input types, try to send keys
            await field.clear();
            await field.sendKeys(valueToUse);
        }
        
        console.log(`Successfully filled ${fieldType} field with value: ${valueToUse}`);
        return true;
    } catch (e) {
        console.log(`Error filling field: ${e.message}`);
        return false;
    }
}

// Helper function to find form elements with various strategies
async function findFormElement(driver, input, formFillPatterns) {
    // Try multiple strategies to find the element
    let element = null;
    
    // Array of strategies to try
    const strategies = [
        // By ID
        async () => input.id ? await driver.findElement(By.id(input.id)).catch(() => null) : null,
        
        // By name
        async () => input.name ? await driver.findElement(By.name(input.name)).catch(() => null) : null,
        
        // For textareas
        async () => input.tagName === 'textarea' ? await driver.findElement(By.css('textarea')).catch(() => null) : null,
        
        // By placeholder text
        async () => input.placeholder ? await driver.findElement(By.css(`[placeholder="${input.placeholder}"]`)).catch(() => null) : null,
        
        // By element type and common attributes
        async () => {
            if (input.type === 'text') {
                // Try different text input selectors based on common patterns
                const textSelectors = [
                    'input[type="text"][id*="name" i]',
                    'input[type="text"][name*="name" i]',
                    'input[type="text"][id*="email" i]',
                    'input[type="text"][name*="email" i]',
                    'input[type="text"][id*="subject" i]',
                    'input[type="text"][name*="subject" i]',
                    'input[type="text"]'
                ];
                
                for (const selector of textSelectors) {
                    const el = await driver.findElement(By.css(selector)).catch(() => null);
                    if (el) return el;
                }
            }
            return null;
        },
        
        // Try to match by label text (useful for form inputs with labels)
        async () => {
            // Common form field labels
            const commonLabels = ['Name', 'Email', 'Subject', 'Message', 'Comment', 'Feedback', 'Question'];
            for (const labelText of commonLabels) {
                try {
                    // Find label with this text
                    const label = await driver.findElement(By.xpath(`//label[contains(text(), '${labelText}')]`));
                    if (label) {
                        // Check if it has a 'for' attribute
                        const forAttribute = await label.getAttribute('for');
                        if (forAttribute) {
                            return await driver.findElement(By.id(forAttribute)).catch(() => null);
                        }
                        // If no 'for' attribute, check nearby inputs
                        const parentElement = await label.findElement(By.xpath('./..'));
                        return await parentElement.findElement(By.css('input, textarea, select')).catch(() => null);
                    }
                } catch (e) {
                    // Continue to next label
                }
            }
            return null;
        }
    ];
    
    // Try each strategy until we find an element
    for (const strategy of strategies) {
        element = await strategy();
        if (element) break;
    }
    
    return element;
}

// Helper to take a screenshot with a highlighted element
async function takeScreenshotWithHighlight(driver, link, description) {
    try {
        // Only highlight if we have an element reference
        if (link.element) {
            await driver.executeScript(`
                const el = arguments[0];
                if (el && el.style) {
                    el.originalOutline = el.style.outline;
                    el.originalBackground = el.style.backgroundColor;
                    el.style.outline = '3px solid red';
                    el.style.backgroundColor = 'yellow';
                }
            `, link.element);
        }
        
        // Take screenshot
        await driver.takeScreenshot().then(data => {
            const fileName = `${description}_${Date.now()}.png`;
            const screenshotPath = path.join(__dirname, 'screenshots');
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(screenshotPath)) {
                fs.mkdirSync(screenshotPath, { recursive: true });
            }
            
            fs.writeFileSync(path.join(screenshotPath, fileName), data, 'base64');
        });
        
        // Restore original styling
        if (link.element) {
            await driver.executeScript(`
                const el = arguments[0];
                if (el && el.style) {
                    el.style.outline = el.originalOutline || '';
                    el.style.backgroundColor = el.originalBackground || '';
                }
            `, link.element);
        }
    } catch (e) {
        console.log(`Screenshot error: ${e.message}`);
    }
}

// Helper to process new content that appears after interactions
async function detectAndProcessNewContent(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms) {
    try {
        // Check if new UI elements appeared
        const newUIElementsAppeared = await driver.executeScript(`
            return {
                modals: document.querySelectorAll('.modal.show, [role="dialog"][aria-modal="true"], .ui-dialog').length,
                dropdowns: document.querySelectorAll('.dropdown.show, .dropdown-menu.show, [aria-expanded="true"]').length,
                collapses: document.querySelectorAll('.collapse.show, details[open]').length,
                popups: document.querySelectorAll('.popover, .tooltip:visible, .popup:visible').length,
                tabs: document.querySelectorAll('.tab-pane.active, [role="tabpanel"]:not([hidden])').length
            };
        `);
        
        console.log(`Detected new UI elements: `, newUIElementsAppeared);
        
        let hasProcessedNewContent = false;
        
        // If any new UI elements appeared, process them
        if (Object.values(newUIElementsAppeared).some(val => val > 0)) {
            console.log('New interactive elements appeared - processing them');
            
            // Look for forms in these new elements
            const formsInNewContent = await driver.executeScript(`
                // Helper to check if element is visible
                function isVisible(element) {
                    if (!element) return false;
                    const style = window.getComputedStyle(element);
                    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length) && 
                           style.visibility !== 'hidden' && 
                           style.display !== 'none' &&
                           style.opacity !== '0';
                }
                
                // Find forms in modals, dialogs, etc.
                const newContainers = Array.from(document.querySelectorAll(
                    '.modal.show, [role="dialog"][aria-modal="true"], .ui-dialog, ' +
                    '.dropdown.show, .dropdown-menu.show, [aria-expanded="true"], ' +
                    '.collapse.show, details[open], ' + 
                    '.popover, .tooltip:visible, .popup:visible, ' +
                    '.tab-pane.active, [role="tabpanel"]:not([hidden])'
                ));
                
                // Find forms within these containers
                return newContainers
                    .map(container => {
                        // Get all forms in this container
                        const traditionalForms = Array.from(container.querySelectorAll('form'));
                        
                        // Get form-like divs in this container
                        const formDivs = Array.from(container.querySelectorAll('div'))
                            .filter(div => {
                                const inputs = div.querySelectorAll('input, textarea, select');
                                return inputs.length > 0 && isVisible(div);
                            });
                        
                        return [...traditionalForms, ...formDivs];
                    })
                    .flat()
                    .map(form => {
                        // Process each form
                        const inputs = Array.from(form.querySelectorAll('input, select, textarea'))
                            .filter(input => isVisible(input))
                            .map(input => {
                                return {
                                    type: input.tagName.toLowerCase() === 'textarea' ? 'textarea' : (input.type || 'text'),
                                    name: input.name || '',
                                    id: input.id || '',
                                    placeholder: input.placeholder || '',
                                    value: input.value || '',
                                    required: input.required || false,
                                    tagName: input.tagName.toLowerCase()
                                };
                            });
                        
                        // Try to determine form type based on inputs
                        let formType = 'unknown';
                        
                        // Look for password fields to identify login forms
                        if (inputs.some(i => i.type === 'password')) {
                            formType = 'login';
                        }
                        // Look for feedback/contact form patterns
                        else if (inputs.some(i => i.type === 'textarea' || i.name?.includes('comment') || i.id?.includes('feedback'))) {
                            formType = 'feedback';
                        }
                        
                        return {
                            action: form.action || '',
                            id: form.id || '',
                            method: form.method || 'get',
                            inputs: inputs,
                            formType: formType,
                            element: form
                        };
                    });
            `);
            
            console.log(`Found ${formsInNewContent.length} forms in new content`);
            
            // Process each form we found
            for (const form of formsInNewContent) {
                console.log(`Processing form in new UI element: ${form.formType} form`);
                
                // Fill the form
                await fillFormInNewContent(driver, form);
                
                hasProcessedNewContent = true;
            }
            
            // If we've processed new content and there are dialogs, try to close them afterward
            if (hasProcessedNewContent) {
                await driver.sleep(2000); // Wait to see the results
                
                // Only close dialogs if explicitly configured to do so
                if (CONFIG.autoCloseDialogs) {
                    // Try to close modals and dialogs
                    await driver.executeScript(`
                        // Try different ways to close modals
                        document.querySelectorAll('.modal.show .close, .modal.show .btn-close, .modal.show [data-dismiss="modal"], [role="dialog"] .close').forEach(el => {
                            el.click();
                        });
                        
                        // Try ESC key for dialogs
                        const dialogs = document.querySelectorAll('.modal.show, [role="dialog"][aria-modal="true"], .ui-dialog');
                        if (dialogs.length > 0) {
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27 }));
                        }
                    `);
                }
            }
        }
        
        return hasProcessedNewContent;
    } catch (e) {
        console.log(`Error processing new content: ${e.message}`);
        return false;
    }
}

// Helper to fill forms in new content (modals, dialogs, etc.)
async function fillFormInNewContent(driver, form) {
    try {
        let filledFields = 0;
        
        // Process each input in the form
        for (const input of form.inputs) {
            if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
                continue;
            }
            
            // Determine appropriate value
            let valueToUse = '';
            
            // Handle select/dropdown elements differently
            if (input.type === 'select' || input.tagName === 'SELECT') {
                // For select elements, we'll handle them separately
                valueToUse = null; // Mark for special handling
            } else if (input.name?.toLowerCase().includes('name') || input.id?.toLowerCase().includes('name')) {
                valueToUse = CONFIG.formFillPatterns.name;
            } else if (input.name?.toLowerCase().includes('email') || input.id?.toLowerCase().includes('email')) {
                valueToUse = CONFIG.formFillPatterns.email;
            } else if (input.name?.toLowerCase().includes('subject') || input.id?.toLowerCase().includes('subject')) {
                valueToUse = CONFIG.formFillPatterns.subject;
            } else if (input.name?.toLowerCase().includes('comment') || input.id?.toLowerCase().includes('comment') ||
                       input.type === 'textarea' || input.name?.toLowerCase().includes('message') || 
                       input.id?.toLowerCase().includes('message')) {
                valueToUse = CONFIG.formFillPatterns.message;
            } else if (input.type === 'text') {
                valueToUse = 'Test value for ' + (input.name || input.id || 'text field');
            } else if (input.type === 'password') {
                valueToUse = CONFIG.formFillPatterns.password;
            }
            
            if (valueToUse) {
                // Find the element using JavaScript
                const inputField = await driver.executeScript(`
                    const input = arguments[0];
                    let el = null;
                    
                    // Try by ID
                    if (input.id) {
                        el = document.getElementById(input.id);
                        if (el) return el;
                    }
                    
                    // Try by name
                    if (input.name) {
                        const els = document.getElementsByName(input.name);
                        if (els.length > 0) return els[0];
                    }
                    
                    // Try by type and placeholder
                    if (input.type === 'textarea') {
                        el = document.querySelector('textarea');
                        if (el) return el;
                    }
                    
                    // Try to find select elements
                    if (input.type === 'select' || input.tagName === 'SELECT') {
                        if (input.id) {
                            el = document.querySelector('select#' + input.id);
                        } else if (input.name) {
                            el = document.querySelector('select[name="' + input.name + '"]');
                        } else {
                            // Try to find any select element in the form
                            const form = input.form ? document.getElementById(input.form) : document.querySelector('form');
                            if (form) {
                                el = form.querySelector('select');
                            }
                        }
                        if (el) return el;
                    }
                    
                    return null;
                `, input);
                
                if (inputField) {
                    // Special handling for select elements
                    if (input.type === 'select' || input.tagName === 'SELECT' || await driver.executeScript(`return arguments[0].tagName === 'SELECT'`, inputField)) {
                        console.log('Handling SELECT dropdown element');
                        
                        // Get information about the select element and its options
                        const selectInfo = await driver.executeScript(`
                            const selectField = arguments[0];
                            
                            // Gather options information
                            const optionsInfo = Array.from(selectField.options).map((opt, index) => ({
                                index: index,
                                text: opt.text,
                                value: opt.value,
                                selected: opt.selected,
                                disabled: opt.disabled,
                                isPlaceholder: opt.text.toLowerCase().includes('select') || 
                                              opt.text.toLowerCase().includes('choose') ||
                                              opt.text.toLowerCase().includes('--') ||
                                              opt.text.toLowerCase().includes('pick') ||
                                              opt.value === ''
                            }));
                            
                            return {
                                id: selectField.id,
                                name: selectField.name,
                                options: optionsInfo,
                                multiple: selectField.multiple,
                                required: selectField.required,
                                optionCount: selectField.options.length
                            };
                        `, inputField);
                        
                        console.log(`Select element has ${selectInfo.optionCount} options`);
                        
                        // Make intelligent selection based on the context
                        await driver.executeScript(`
                            const selectField = arguments[0];
                            const selectName = (selectField.name || selectField.id || '').toLowerCase();
                            
                            // Get all options
                            const options = selectField.options;
                            if (options.length > 0) {
                                // Start with a default selection
                                let selectedIndex = options.length > 1 ? 1 : 0;
                                
                                // Check select field name/id to determine appropriate values
                                // For specific known field types, make contextually appropriate selections
                                if (selectName.includes('country') || selectName.includes('nation')) {
                                    // Look for "United States" or "USA" options for country fields
                                    for (let i = 0; i < options.length; i++) {
                                        const text = options[i].text.toLowerCase();
                                        if (text.includes('united states') || text === 'usa' || text === 'us') {
                                            selectedIndex = i;
                                            break;
                                        }
                                    }
                                } else if (selectName.includes('state')) {
                                    // Pick a common state
                                    for (let i = 0; i < options.length; i++) {
                                        const text = options[i].text.toLowerCase();
                                        if (['california', 'new york', 'texas', 'florida'].some(s => text.includes(s))) {
                                            selectedIndex = i;
                                            break;
                                        }
                                    }
                                } else if (selectName.includes('month')) {
                                    // Pick a month that's not January (which might be default)
                                    for (let i = 0; i < options.length; i++) {
                                        if (options[i].value && options[i].value !== '1' && options[i].value !== '01') {
                                            selectedIndex = i;
                                            break;
                                        }
                                    }
                                } else if (selectName.includes('gender')) {
                                    // Randomly pick a gender option
                                    const genderIndex = Math.floor(Math.random() * options.length);
                                    if (options[genderIndex].value) {
                                        selectedIndex = genderIndex;
                                    }
                                } else {
                                    // Find any valid option that isn't a placeholder
                                    for (let i = 0; i < options.length; i++) {
                                        const optionText = options[i].text.toLowerCase();
                                        const optionValue = options[i].value;
                                        if (optionValue && 
                                            !optionText.includes('select') && 
                                            !optionText.includes('choose') &&
                                            !optionText.includes('--') &&
                                            !optionText.includes('please') &&
                                            !optionText.includes('pick')) {
                                            selectedIndex = i;
                                            break;
                                        }
                                    }
                                }
                                
                                // Select the option using both methods for compatibility
                                selectField.selectedIndex = selectedIndex;
                                selectField.value = options[selectedIndex].value;
                                
                                // Trigger events for proper detection by frameworks
                                selectField.dispatchEvent(new Event('change', { bubbles: true }));
                                selectField.dispatchEvent(new Event('input', { bubbles: true }));
                                
                                console.log('Selected option index ' + selectedIndex + ' in select field: ' + 
                                           options[selectedIndex].text);
                                
                                return {
                                    selectedIndex: selectedIndex,
                                    selectedText: options[selectedIndex].text,
                                    selectedValue: options[selectedIndex].value
                                };
                            }
                        `, inputField);
                        console.log(`Handled select/dropdown field in form`);
                    } else {
                        // Regular input field handling
                        await driver.executeScript(`
                            const field = arguments[0];
                            const value = arguments[1];
                            
                            // Clear existing value
                            field.value = '';
                            
                            // Set the new value
                            field.value = value;
                            
                            // Trigger events
                            field.dispatchEvent(new Event('input', { bubbles: true }));
                            field.dispatchEvent(new Event('change', { bubbles: true }));
                        `, inputField, valueToUse);
                        console.log(`Filled ${input.type} field in dialog`);
                    }
                    
                    filledFields++;
                }
            }
        }
        
        // If we filled at least one field, try to submit the form
        if (filledFields > 0) {
            // Look for submit button
            const submitButton = await driver.executeScript(`
                const form = arguments[0].element;
                if (!form) return null;
                
                // Try to find submit button
                const submitSelectors = [
                    'input[type="submit"]', 
                    'button[type="submit"]',
                    'button.submit',
                    'button.btn-primary',
                    'button:contains("Submit")',
                    'button:contains("Send")',
                    'button:contains("Save")'
                ];
                
                for (const selector of submitSelectors) {
                    try {
                        const btn = form.querySelector(selector) || document.querySelector(selector);
                        if (btn) return btn;
                    } catch (e) {
                        // Continue trying other selectors
                    }
                }
                
                return null;
            `, form);
            
            if (submitButton) {
                // Click the submit button
                await driver.executeScript('arguments[0].click();', submitButton);
                console.log('Submitted form in dialog');
                
                // Wait to see the results
                await driver.sleep(2000);
            } else {
                console.log('No submit button found for dialog form');
            }
        }
        
        return filledFields > 0;
    } catch (e) {
        console.log(`Error filling form in dialog: ${e.message}`);
        return false;
    }
}

// Main scan function
async function scanSite(url, options = {}) {
    const maxDepth = options.maxDepth || CONFIG.maxDepth;
    const maxLinks = options.maxLinksPerPage || CONFIG.maxLinksPerPage;
    
    // Set up Chrome options
    const chromeOptions = new chrome.Options()
        .windowSize({ width: 1366, height: 768 })
        .addArguments('--no-sandbox')
        .addArguments('--disable-dev-shm-usage')
        .addArguments('--disable-web-security');
    
    // Initialize driver
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(chromeOptions)
        .build();
    
    try {
        // Tracking variables - using Set for more efficient lookups
        const visitedUrls = new Set([normalizeUrl(url)]);
        const findings = [];
        const forms = [];
        
        // Navigate to start URL
        console.log(`Navigating to ${url}`);
        
        // Apply rate limiting
        await applyRateLimit(url);
        
        await driver.get(url);
        await driver.wait(until.elementLocated(By.css('body')), 10000);
        
        // Wait for JavaScript to execute
        await waitForJavaScript(driver, url);
        
        console.log(`Successfully loaded ${url}`);
        
        // Take screenshot for verification
        const screenshotPath = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotPath)) {
            fs.mkdirSync(screenshotPath);
        }
        await driver.takeScreenshot().then(data => {
            fs.writeFileSync(path.join(screenshotPath, `initial_page_${Date.now()}.png`), data, 'base64');
        });
        
        // Start scanning from the initial URL
        const results = await crawlPage(driver, url, visitedUrls, 0, maxDepth, maxLinks, findings, forms, normalizeUrl);
        
        return {
            url,
            visitedUrls,
            findings: results.findings,
            forms: results.forms,
            links: results.links
        };
    } finally {
        // Always close the browser
        await driver.quit();
        console.log('Browser closed');
    }
}

// Function to crawl a single page
async function crawlPage(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms, normalizeUrlFunc) {
    console.log(`Crawling page: ${url} (depth ${depth}/${maxDepth})`);
    
    // Apply rate limiting
    await applyRateLimit(url);
    
    // Get page info
    const title = await safeOperation(async () => await driver.getTitle(), 'Unknown Title');
    console.log(`Page title: ${title}`);
    
    const pageLinks = [];
    const pageForms = [];
    const pageFindings = [];
    
    // Process forms - with enhanced form detection
    console.log('Detecting and processing forms');
    
    // Use enhanced form detection
    const formElements = await detectAllForms(driver, url);
    
    // Process each detected form
    for (const formElement of formElements) {
        try {
            // Get form information
            const formInfo = await driver.executeScript(`
                const form = arguments[0];
                
                // Get all input elements with enhanced detection for select elements and custom inputs
                const inputs = Array.from(form.querySelectorAll('input, select, textarea'))
                    .map(input => {
                        // Determine input type with better handling for selects
                        let inputType = '';
                        if (input.tagName.toLowerCase() === 'textarea') {
                            inputType = 'textarea';
                        } else if (input.tagName.toLowerCase() === 'select') {
                            inputType = 'select';
                            
                            // See if this select has options and how many
                            const optionCount = input.options ? input.options.length : 0;
                            const hasSelectedOption = Array.from(input.options || []).some(opt => opt.selected);
                            
                            return {
                                type: 'select',
                                name: input.name || '',
                                id: input.id || '',
                                placeholder: input.placeholder || '',
                                value: input.value || '',
                                required: input.required || false,
                                tagName: 'select',
                                multiple: input.multiple || false,
                                optionCount: optionCount,
                                hasSelectedOption: hasSelectedOption
                            };
                        } else {
                            inputType = input.type || 'text';
                        }
                        
                        return {
                            type: inputType,
                            name: input.name || '',
                            id: input.id || '',
                            placeholder: input.placeholder || '',
                            value: input.value || '',
                            required: input.required || false,
                            tagName: input.tagName.toLowerCase()
                        };
                    });
                
                // Try to determine form type based on inputs and action URL
                let formType = 'unknown';
                const action = form.action || '';
                const formId = form.id || '';
                const formClassName = form.className || '';
                
                // Look for password fields to identify login forms
                if (inputs.some(i => i.type === 'password')) {
                    formType = 'login';
                }
                // Look for search-related attributes
                else if (action.includes('search') || formId.includes('search') || 
                        formClassName?.includes('search') ||
                        inputs.some(i => i.name === 'search' || i.name === 'query' || i.name === 'q' || 
                                    i.id?.includes('search') || i.placeholder?.toLowerCase().includes('search'))) {
                    formType = 'search';
                }
                // Look for contact form patterns
                else if ((inputs.some(i => i.name === 'email' || i.name?.includes('mail') || i.id?.includes('email')) &&
                        (inputs.some(i => i.name?.includes('message') || i.name?.includes('comment') || i.id?.includes('message') || i.tagName === 'textarea') || 
                         form.className?.includes('contact') || form.id?.includes('contact'))) ||
                        (inputs.some(i => i.tagName === 'textarea') && inputs.length >= 3)) {
                    formType = 'contact';
                }
                // Look for registration form patterns
                else if (inputs.length > 2 && 
                        (inputs.some(i => i.name?.includes('email') || i.name?.includes('mail') || i.id?.includes('email')) || 
                         form.className?.includes('register') || form.id?.includes('register') || 
                         action?.includes('register') || action?.includes('signup'))) {
                    formType = 'registration';
                }
                // Look for transaction forms
                else if (action?.includes('transaction') || formId?.includes('transaction') || 
                         formClassName?.includes('transaction') || formClassName?.includes('payment') ||
                         inputs.some(i => i.name?.includes('amount') || i.name?.includes('payment') || 
                                    i.id?.includes('amount') || i.name?.includes('transfer'))) {
                    formType = 'transaction';
                }
                // Look for comment/feedback forms - expanded detection
                else if (inputs.some(i => i.name?.includes('comment') || i.id?.includes('feedback') || 
                                      i.name?.includes('feedback') || i.name?.includes('subject') ||
                                      i.name?.includes('question') || i.id?.includes('question') ||
                                      i.placeholder?.toLowerCase().includes('comment') ||
                                      i.placeholder?.toLowerCase().includes('feedback') ||
                                      i.placeholder?.toLowerCase().includes('message') ||
                                      i.placeholder?.toLowerCase().includes('suggestion') ||
                                      i.id?.includes('message') || i.name?.includes('message')) || 
                        formId?.includes('comment') || formClassName?.includes('comment') ||
                        formId?.includes('feedback') || formClassName?.includes('feedback') ||
                        formId?.includes('guestbook') || formClassName?.includes('guestbook') ||
                        formId?.includes('suggestion') || formClassName?.includes('suggestion') ||
                        (inputs.some(i => i.tagName === 'textarea') && inputs.length >= 2) ||
                        (inputs.some(i => i.tagName === 'textarea') && 
                         inputs.some(i => i.name?.includes('email') || i.id?.includes('email') || 
                                         i.name?.includes('name') || i.id?.includes('name')))) {
                    formType = 'feedback';
                }
                
                return {
                    action: action,
                    id: formId,
                    method: form.method || 'get',
                    inputs: inputs,
                    formType: formType,
                    element: form
                };
            `, formElement);
            
            console.log(`Processing ${formInfo.formType} form with ${formInfo.inputs.length} fields`);
            pageForms.push({
                type: formInfo.formType,
                url: url,
                fields: formInfo.inputs.length,
                processed: false
            });
            
            // Generic form processing - works for all form types
            try {
                console.log(`Processing form generically with ${formInfo.inputs.length} fields`);
                let filledFields = 0;
                
                // Process each input in the form
                for (const input of formInfo.inputs) {
                    if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
                        continue;
                    }
                    
                    // Determine appropriate value based on field attributes
                    let valueToUse = '';
                    
                    // Helper function to check if input matches a pattern
                    const matches = (pattern, field) => {
                        if (!field) return false;
                        const fieldLower = field.toLowerCase();
                        if (typeof pattern === 'string') {
                            return fieldLower.includes(pattern.toLowerCase());
                        }
                        if (Array.isArray(pattern)) {
                            return pattern.some(p => fieldLower.includes(p.toLowerCase()));
                        }
                        return false;
                    };
                    
                    // Check name field
                    if (matches(['name', 'fname', 'lname', 'firstname', 'lastname', 'full name', 'user'], input.name) || 
                        matches(['name', 'fname', 'lname', 'firstname', 'lastname', 'full name', 'user'], input.id) ||
                        (input.placeholder && matches(['name', 'your name'], input.placeholder))) {
                        valueToUse = CONFIG.formFillPatterns.name;
                    } 
                    // Check email field
                    else if (matches(['email', 'mail', 'e-mail'], input.name) || 
                             matches(['email', 'mail', 'e-mail'], input.id) ||
                             (input.type === 'email') ||
                             (input.placeholder && matches(['email', 'e-mail', 'your email'], input.placeholder))) {
                        valueToUse = CONFIG.formFillPatterns.email;
                    } 
                    // Check phone field
                    else if (matches(['phone', 'tel', 'mobile', 'cell'], input.name) || 
                             matches(['phone', 'tel', 'mobile', 'cell'], input.id) ||
                             (input.type === 'tel') ||
                             (input.placeholder && matches(['phone', 'telephone', 'mobile'], input.placeholder))) {
                        valueToUse = CONFIG.formFillPatterns.phone;
                    }
                    // Check subject field
                    else if (matches(['subject', 'topic', 'regarding', 'about'], input.name) || 
                             matches(['subject', 'topic', 'regarding', 'about'], input.id) ||
                             (input.placeholder && matches(['subject', 'topic', 'regarding'], input.placeholder))) {
                        valueToUse = CONFIG.formFillPatterns.subject;
                    } 
                    // Check message/comment field
                    else if (matches(['comment', 'message', 'feedback', 'question', 'suggestion'], input.name) || 
                             matches(['comment', 'message', 'feedback', 'question', 'suggestion'], input.id) ||
                             input.type === 'textarea' ||
                             (input.placeholder && matches(['message', 'comment', 'feedback', 'tell us'], input.placeholder))) {
                        valueToUse = CONFIG.formFillPatterns.message;
                    } 
                    // Check search field
                    else if (matches(['search', 'query', 'q', 'find'], input.name) || 
                             matches(['search', 'query', 'q', 'find'], input.id) ||
                             (input.placeholder && matches(['search', 'find', 'query'], input.placeholder))) {
                        valueToUse = CONFIG.formFillPatterns.search;
                    }
                    // Check password field
                    else if (input.type === 'password' || 
                             matches(['password', 'pass', 'pwd'], input.name) || 
                             matches(['password', 'pass', 'pwd'], input.id)) {
                        valueToUse = CONFIG.formFillPatterns.password;
                    }
                    // Check amount field
                    else if (matches(['amount', 'total', 'price'], input.name) || 
                             matches(['amount', 'total', 'price'], input.id)) {
                        valueToUse = CONFIG.formFillPatterns.amount;
                    }
                    // Check address field
                    else if (matches(['address', 'street'], input.name) || 
                             matches(['address', 'street'], input.id)) {
                        valueToUse = CONFIG.formFillPatterns.address;
                    }
                    // Check city field
                    else if (matches(['city'], input.name) || 
                             matches(['city'], input.id)) {
                        valueToUse = CONFIG.formFillPatterns.city;
                    }
                    // Check zip field
                    else if (matches(['zip', 'postal'], input.name) || 
                             matches(['zip', 'postal'], input.id)) {
                        valueToUse = CONFIG.formFillPatterns.zip;
                    }
                    // Default for text fields
                    else if (input.type === 'text') {
                        valueToUse = 'Test value for ' + (input.name || input.id || 'text field');
                    }
                    // Default for number fields
                    else if (input.type === 'number') {
                        valueToUse = '42';
                    }
                    
                    if (valueToUse) {
                        try {
                            // Use our enhanced helper function to find the field
                            const field = await findFormElement(driver, input, CONFIG.formFillPatterns);
                            if (field) {
                                // Use the enhanced form field filling function
                                const filled = await fillFormField(driver, field, valueToUse, input.type);
                                if (filled) {
                                    filledFields++;
                                }
                            } else {
                                console.log(`Could not locate field: ${input.name || input.id || 'unnamed field'}`);
                            }
                        } catch (fieldError) {
                            console.log(`Error filling field ${input.name || input.id || 'unnamed'}: ${fieldError.message}`);
                        }
                    }
                }
                
                // If we filled at least one field, try to submit the form
                if (filledFields > 0) {
                    // Find submit button - check for common submit button patterns
                    const submitButton = await safeOperation(async () => {
                        const cssSelectors = [
                            'input[type="submit"]',
                            'button[type="submit"]',
                            'input[value*="Submit" i]',
                            'input[value*="Send" i]',
                            'input[value*="Post" i]',
                            'input[value*="Comment" i]',
                            'button[class*="submit" i]',
                            'button[id*="submit" i]',
                            'button[class*="btn" i]',
                            '.btn-submit',
                            '.submit-btn',
                            '#submit',
                            '.form-submit',
                            'button.btn-primary',
                            'input.btn-primary'
                        ];
                        // Try CSS selectors first (faster)
                        for (const selector of cssSelectors) {
                            try {
                                const elements = await driver.findElements(By.css(selector));
                                // Use the first visible element
                                for (const element of elements) {
                                    if (await element.isDisplayed()) {
                                        return element;
                                    }
                                }
                            } catch (e) {
                                // Continue trying selectors
                            }
                        }
                        
                        // Try text-based XPath selectors as fallback
                        const xpathSelectors = [
                            "//button[contains(text(), 'Submit')]",
                            "//button[contains(text(), 'Send')]",
                            "//button[contains(text(), 'Post')]",
                            "//button[contains(text(), 'Comment')]",
                            "//input[@value='Submit']",
                            "//input[@value='Send']",
                            "//input[@value='Post']",
                            "//input[@value='Comment']"
                        ];
                        
                        for (const xpath of xpathSelectors) {
                            try {
                                const elements = await driver.findElements(By.xpath(xpath));
                                // Use the first visible element
                                for (const element of elements) {
                                    if (await element.isDisplayed()) {
                                        return element;
                                    }
                                }
                            } catch (e) {
                                // Continue trying selectors
                            }
                        }
                        
                        return null;
                    });
                    
                    if (submitButton) {
                        pageForms[pageForms.length - 1].processed = true;
                        await submitButton.click();
                        console.log('Form submitted');
                        // Wait for navigation or confirmation
                        await driver.sleep(2000);
                        // Check if we're on a new page or if there's a success message
                        const resultUrl = await driver.getCurrentUrl();
                        const successMessage = await safeOperation(async () => {
                            const messageElements = await driver.findElements(By.css('.success, .alert-success, [role="alert"]'));
                            return messageElements.length > 0;
                        });
                        console.log(`After form submission: ${resultUrl} (success: ${successMessage})`);
                        if (!visitedUrls.has(normalizeUrlFunc(resultUrl))) {
                            visitedUrls.add(normalizeUrlFunc(resultUrl));
                            // Recursively scan the results page if we're not too deep
                            if (depth < maxDepth) {
                                await crawlPage(driver, resultUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms, normalizeUrlFunc);
                            }
                        }
                    } else {
                        console.log('No submit button found for form');
                    }
                } else {
                    console.log('No fields were filled in the form');
                }
            } catch (formError) {
                console.log(`Generic form processing error: ${formError.message}`);
            }
        } catch (formError) {
            console.log(`Error processing form: ${formError.message}`);
        }
    }
    
    // Collect links and interactive elements on the current page
    try {
        // Simplified approach to collect links and interactive elements
        const links = await driver.executeScript(`
            // Function to get computed style visibility
            function isVisible(element) {
                if (!element) return false;
                const style = window.getComputedStyle(element);
                return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length) && 
                       style.visibility !== 'hidden' && 
                       style.display !== 'none' &&
                       style.opacity !== '0';
            }
            
            // Function to check if an element is likely to be clickable
            function isLikelyClickable(element) {
                if (!element) return false;
                
                // Check if the element has click-related attributes
                if (element.onclick || 
                    element.getAttribute('ng-click') || 
                    element.getAttribute('v-on:click') ||
                    element.getAttribute('@click') ||
                    element.getAttribute('data-toggle') ||
                    element.getAttribute('data-target')) {
                    return true;
                }
                
                // Check if the element has styling that suggests it's clickable
                const style = window.getComputedStyle(element);
                if (style.cursor === 'pointer') {
                    return true;
                }
                
                // Check for common class patterns that suggest clickability
                const classNames = element.className || '';
                if (typeof classNames === 'string' && (
                    classNames.includes('clickable') || 
                    classNames.includes('button') || 
                    classNames.includes('btn') || 
                    classNames.includes('link') ||
                    classNames.includes('action') ||
                    classNames.includes('selectable')
                )) {
                    return true;
                }
                
                return false;
            }
            
            // Collect standard links
            const standardLinks = Array.from(document.querySelectorAll('a[href]'))
                .map(a => {
                    return {
                        href: a.href,
                        text: a.textContent.trim(),
                        visible: isVisible(a),
                        type: 'link',
                        jsAction: a.href.startsWith('javascript:') ? a.href : null
                    }
                })
                .filter(link => {
                    return link.visible && !link.href.startsWith('mailto:');
                });
                
            // Collect buttons and clickable elements
            const clickableElements = Array.from(document.querySelectorAll(
                'button, [role="button"], input[type="button"], input[type="submit"], input[type="image"], ' +
                '.btn, .button, .clickable, .nav-link, .menu-item'
            ))
                .filter(el => isVisible(el))
                .map(el => {
                    return {
                        element: el,
                        text: el.textContent.trim() || el.getAttribute('title') || el.getAttribute('aria-label') || 'Unlabeled Button',
                        visible: true,
                        type: 'button'
                    };
                });
                
            return [...standardLinks, ...clickableElements];
        `);
        
        console.log(`Found ${links.length} links and interactive elements on page`);
        
        // Filter standard links to only include links to same domain
        const internalLinks = links.filter(link => {
            if (link.type !== 'link') return true; // Keep all interactive elements
            try {
                const linkUrl = new URL(link.href);
                const pageUrl = new URL(url);
                return linkUrl.hostname === pageUrl.hostname && link.visible;
            } catch (e) {
                return link.visible; // If we can't parse the URL, include it if it's visible
            }
        });
        
        console.log(`Found ${internalLinks.length} internal links and interactive elements`);
        
        // Prioritize "interesting" links based on security-sensitive patterns
        const interestingLinks = internalLinks
            .filter(link => {
                const text = (link.text || '').toLowerCase();
                const href = link.href ? link.href.toLowerCase() : '';
                // Security-sensitive pages get higher priority
                return text.includes('account') ||
                    text.includes('login') ||
                    text.includes('profile') ||
                    text.includes('transfer') ||
                    text.includes('register') ||
                    text.includes('password') ||
                    text.includes('admin') ||
                    text.includes('setting') ||
                    text.includes('feedback') ||
                    text.includes('contact') ||
                    text.includes('upload') ||
                    text.includes('payment') ||
                    text.includes('transact') ||
                    text.includes('edit') ||
                    text.includes('delete') ||
                    text.includes('config') ||
                    text.includes('report') ||
                    text.includes('history') ||
                    text.includes('download') ||
                    href.includes('account') ||
                    href.includes('login') ||
                    href.includes('profile') ||
                    href.includes('admin') ||
                    href.includes('transfer') ||
                    href.includes('feedback') ||
                    href.includes('password') ||
                    href.includes('config') ||
                    href.includes('history') ||
                    href.includes('report') ||
                    href.includes('download') ||
                    href.match(/id=\d+/) ||  // Look for numeric IDs in URLs (potential IDOR)
                    href.includes('file=') ||  // Potential file inclusion vulnerabilities
                    href.includes('upload');
            });
        
        // Filter out links that have already been visited
        const unvisitedLinks = internalLinks.filter(link => {
            if (link.type !== 'link' || !link.href) return true; // Keep interactive elements
            return !visitedUrls.has(normalizeUrlFunc(link.href));
        });
        
        // Combine interesting and regular links, prioritizing interesting ones
        const linksToFollow = [
            ...unvisitedLinks.filter(link => interestingLinks.includes(link)),
            ...unvisitedLinks.filter(link => !interestingLinks.includes(link))
        ].slice(0, maxLinks);
        
        console.log(`Will follow up to ${linksToFollow.length} links and interactive elements`);
        
        // Follow links and interact with clickable elements
        for (const link of linksToFollow) {
            // For standard links with URLs
            if (link.type === 'link') {
                // Special handling for javascript: links
                if (link.jsAction) {
                    console.log(`Executing JavaScript link: ${link.text.substring(0, 30)}`);
                    try {
                        // Execute the javascript directly
                        const jsCode = link.jsAction.replace('javascript:', '');
                        await driver.executeScript(`
                            try {
                                ${jsCode};
                                return true;
                            } catch(e) {
                                console.error("Error executing JS link:", e);
                                return false;
                            }
                        `);
                        
                        // Wait for any UI changes
                        await driver.sleep(1500);
                        
                        // Check for new content or forms
                        await detectAndProcessNewContent(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms);
                        
                        // Continue to next link
                        continue;
                    } catch (jsError) {
                        console.log(`Error executing JavaScript link: ${jsError.message}`);
                        continue;
                    }
                }
                
                // Special handling for anchor/hash links that may change UI state
                if (link.href.includes('#') && link.href.startsWith(url + '#')) {
                    console.log(`Clicking anchor link: ${link.text.substring(0, 30)}`);
                    try {
                        // Find the actual anchor element and click it
                        const anchorElement = await safeOperation(async () => {
                            return await driver.findElement(By.css(`a[href="${link.href.substring(link.href.indexOf('#'))}"]`));
                        });
                        
                        if (anchorElement) {
                            await anchorElement.click();
                            // Wait for any UI changes
                            await driver.sleep(1500);
                            
                            // Check for new content or forms
                            await detectAndProcessNewContent(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms);
                        } else {
                            // If we can't find the element, just navigate to it
                            await driver.get(link.href);
                            await driver.sleep(1000);
                        }
                        
                        // Continue to next link
                        continue;
                    } catch (anchorError) {
                        console.log(`Error handling anchor link: ${anchorError.message}`);
                        continue;
                    }
                }
                
                // Standard link handling for regular URLs
                const normalizedLinkUrl = normalizeUrlFunc(link.href);
                if (visitedUrls.has(normalizedLinkUrl)) {
                    console.log(`Skipping already visited: ${link.href}`);
                    continue;
                }
                
                console.log(`Following link: ${link.href}`);
                console.log(`Link text: ${link.text.substring(0, 30)}`);
                
                // Add to visited list before navigating
                visitedUrls.add(normalizedLinkUrl);
                
                try {
                    // Apply rate limiting
                    await applyRateLimit(link.href);
                    
                    // Take screenshot before navigation
                    await takeScreenshotWithHighlight(driver, link, 'before_click');
                    
                    // Navigate to the link
                    await driver.get(link.href);
                    await driver.wait(until.elementLocated(By.css('body')), 10000);
                    
                    // Wait for JavaScript to execute
                    await waitForJavaScript(driver, link.href);
                    
                    // Recursively scan the linked page
                    if (depth < maxDepth) {
                        await crawlPage(driver, link.href, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms, normalizeUrlFunc);
                    }
                    
                    // Navigate back to original page
                    await driver.get(url);
                    await driver.wait(until.elementLocated(By.css('body')), 10000);
                } catch (navigationError) {
                    console.log(`Error navigating to ${link.href}: ${navigationError.message}`);
                    // Try to get back to original page
                    try {
                        await driver.get(url);
                        await driver.wait(until.elementLocated(By.css('body')), 10000);
                    } catch (e) {
                        console.log(`Failed to get back to ${url}`);
                    }
                }
            } else {
                // For interactive elements that need to be clicked
                console.log(`Clicking interactive element: ${link.text.substring(0, 30)}`);
                try {
                    // Take screenshot before clicking
                    await takeScreenshotWithHighlight(driver, link, 'before_click');
                    
                    // Check if element is still present and clickable
                    const elementStillPresent = await driver.executeScript(`
                        const el = arguments[0];
                        if (!el || !document.body.contains(el)) return false;
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    `, link.element);
                    
                    if (!elementStillPresent) {
                        console.log('Element no longer present or visible on page, skipping');
                        continue;
                    }
                    
                    // Try to scroll element into view first
                    await driver.executeScript('arguments[0].scrollIntoView({behavior: "smooth", block: "center"});', link.element);
                    await driver.sleep(500);
                    
                    // Click the interactive element
                    if (link.type === 'interactive' || link.type === 'button') {
                        // Use different clicking strategies
                        try {
                            // First try: standard WebDriver click
                            try {
                                await driver.findElement(By.css('html')).sendKeys(Key.ESCAPE); // Close any open tooltips/popovers
                                await driver.sleep(300);
                                await driver.executeScript('arguments[0].click();', link.element);
                            } catch (e) {
                                // Second try: JavaScript click simulation with mouse events
                                await driver.executeScript(`
                                    function simulateClick(element) {
                                        const event1 = new MouseEvent('mousedown', {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window
                                        });
                                        const event2 = new MouseEvent('mouseup', {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window
                                        });
                                        const event3 = new MouseEvent('click', {
                                            bubbles: true,
                                            cancelable: true,
                                            view: window
                                        });
                                        
                                        element.dispatchEvent(event1);
                                        element.dispatchEvent(event2);
                                        element.dispatchEvent(event3);
                                    }
                                    simulateClick(arguments[0]);
                                `, link.element);
                            }
                        } catch (clickError) {
                            console.log(`All click attempts failed: ${clickError.message}`);
                        }
                        
                        // Wait for any reactions - longer wait for interactive elements
                        await driver.sleep(2500);
                        
                        // Take screenshot after clicking
                        await takeScreenshotWithHighlight(driver, link, 'after_click');
                        
                        // Check if URL changed
                        const newUrl = await driver.getCurrentUrl();
                        if (newUrl !== url && !visitedUrls.has(normalizeUrlFunc(newUrl))) {
                            console.log(`Interactive element navigated to new URL: ${newUrl}`);
                            visitedUrls.add(normalizeUrlFunc(newUrl));
                            // Recursively scan this new page
                            if (depth < maxDepth) {
                                await crawlPage(driver, newUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms, normalizeUrlFunc);
                            }
                            // Navigate back
                            await driver.get(url);
                            await driver.wait(until.elementLocated(By.css('body')), 10000);
                            continue;
                        }
                        
                        // Process any new elements that appeared
                        await detectAndProcessNewContent(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms);
                    }
                } catch (interactionError) {
                    console.log(`Error interacting with element: ${interactionError.message}`);
                }
                // No need to navigate away since we're still on the same page
                continue;
            }
        }
        
        // Add all links to page links collection
        pageLinks.push(...internalLinks.map(l => ({ url: l.href, text: l.text })));
    } catch (linkError) {
        console.log(`Error processing links: ${linkError.message}`);
    }
    
    // Enhanced security issue detection
    // Check for insecure connection
    if (url.startsWith('http:')) {
        pageFindings.push({
            type: 'insecure_connection',
            severity: 'high',
            description: 'Page uses insecure HTTP instead of HTTPS'
        });
    }
    
    // Check for login form on non-HTTPS page
    if (url.startsWith('http:') && pageForms.some(f => f.type === 'login')) {
        pageFindings.push({
            type: 'insecure_login',
            severity: 'high',
            description: 'Login form found on non-HTTPS page'
        });
    }
    
    // Check for security headers
    try {
        // Get security headers using JavaScript
        const securityHeaders = await driver.executeScript(`
            const headers = performance.getEntriesByType('navigation')[0].serverTiming || [];
            return {
                hasCSP: document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null,
                hasXFrameOptions: headers.some(h => h.name.toLowerCase() === 'x-frame-options'),
                hasXSSProtection: headers.some(h => h.name.toLowerCase() === 'x-xss-protection')
            };
        `);
        
        if (securityHeaders && !securityHeaders.hasCSP) {
            pageFindings.push({
                type: 'missing_csp',
                severity: 'medium',
                description: 'Content Security Policy (CSP) header not detected'
            });
        }
        
        if (securityHeaders && !securityHeaders.hasXFrameOptions) {
            pageFindings.push({
                type: 'missing_x_frame_options',
                severity: 'medium',
                description: 'X-Frame-Options header not detected (clickjacking risk)'
            });
        }
    } catch (headerError) {
        console.log(`Error checking security headers: ${headerError.message}`);
    }
    
    // Check for forms with autocomplete enabled on sensitive fields
    try {
        const autocompleteIssues = await driver.executeScript(`
            const sensitiveInputs = document.querySelectorAll('input[type="password"], input[name*="card"], input[name*="credit"]');
            return Array.from(sensitiveInputs).some(input => 
                input.autocomplete !== 'off' && 
                (!input.hasAttribute('autocomplete') || input.getAttribute('autocomplete') !== 'off')
            );
        `);
        
        if (autocompleteIssues) {
            pageFindings.push({
                type: 'autocomplete_enabled',
                severity: 'medium',
                description: 'Autocomplete not disabled on sensitive form fields'
            });
        }
    } catch (autocompleteError) {
        console.log(`Error checking autocomplete: ${autocompleteError.message}`);
    }
    
    // Check for potential reflected parameters in URL
    if (url.includes('?') && url.match(/[?&](search|query|q|id|user|name)=/i)) {
        // Check if any of these parameters are reflected in the page
        try {
            const urlParams = new URL(url).searchParams;
            let reflectedParams = false;
            
            for (const [key, value] of urlParams.entries()) {
                if (!value || value.length < 3) continue; // Skip empty or very short values
                
                const isReflected = await driver.executeScript(`
                    return document.body.textContent.includes('${value}');
                `);
                
                if (isReflected) {
                    reflectedParams = true;
                    break;
                }
            }
            
            if (reflectedParams) {
                pageFindings.push({
                    type: 'reflected_parameters',
                    severity: 'medium',
                    description: 'URL parameters are reflected in the page content (potential XSS)'
                });
            }
        } catch (reflectionError) {
            console.log(`Error checking for reflected parameters: ${reflectionError.message}`);
        }
    }
    
    // Add findings from this page to the global list
    findings.push(...pageFindings);
    
    // Add forms from this page to the global list
    forms.push(...pageForms);
    
    // Track when the page scan started for performance metrics
    const pageStartTime = Date.now();
    
    // Create a detailed activity log for analysis
    const pageActivityLog = {
        url,
        title,
        timestamp: new Date().toISOString(),
        links: pageLinks.map(link => ({
            url: link.url,
            text: link.text,
            isExternal: link.url ? !link.url.includes(new URL(url).hostname) : false,
            category: categorizeLink(link)
        })),
        forms: pageForms.map(form => ({
            type: form.type,
            url: form.url,
            fields: form.fields,
            processed: form.processed,
            hasPasswordField: form.type === 'login',
            isSecureEndpoint: form.url && form.url.startsWith('https://')
        })),
        findings: pageFindings,
        loadTime: Date.now() - pageStartTime,
        depth: depth
    };
    
    // Add to the global activity log
    activityLogs.push(pageActivityLog);
    
    return {
        url,
        title,
        links: pageLinks,
        forms: pageForms,
        findings: pageFindings,
        activityLog: pageActivityLog
    };
}

// Main scan endpoint
app.post('/deep-scan', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        console.log(`Starting scan of ${url}`);
        
        // Set a timeout to ensure scan doesn't run too long
        const scanTimeout = setTimeout(() => {
            console.log('Scan timeout reached');
        }, CONFIG.scanTimeout);
        
        const results = await scanSite(url, {
            maxDepth: req.body.maxDepth || CONFIG.maxDepth,
            maxLinksPerPage: req.body.maxLinksPerPage || CONFIG.maxLinksPerPage
        });
        
        clearTimeout(scanTimeout);
        
        // Calculate security score
        const highSeverityCount = results.findings.filter(f => f.severity === 'high').length;
        const mediumSeverityCount = results.findings.filter(f => f.severity === 'medium').length;
        let securityScore = 100;
        securityScore -= (highSeverityCount * 15);
        securityScore -= (mediumSeverityCount * 7);
        securityScore = Math.max(0, securityScore);
        
        console.log(`Scan completed with ${results.findings.length} findings`);
        console.log(`Visited ${results.visitedUrls.size} pages`);
        console.log(`Full results available at http://localhost:${CONFIG.port}/last-scan`);
        
        // Store the results for the /last-scan endpoint
        const fullResults = {
            url,
            visitedUrls: Array.from(results.visitedUrls),
            findings: results.findings,
            forms: results.forms,
            links: results.links || [],
            securityRating: {
                score: securityScore,
                maxScore: 100
            },
            scanCompletedAt: new Date().toISOString()
        };
        
        // Save to lastScanResults
        lastScanResults = fullResults;
        
        res.json(fullResults);
    } catch (error) {
        console.error('Error during scan:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to get raw activity logs (for debugging or custom analysis)
app.get('/activity-logs', (req, res) => {
    res.json({
        status: 'success',
        logs: activityLogs,
        timestamp: new Date().toISOString()
    });
});

// Start server
let server = null;

function startServer() {
    server = app.listen(CONFIG.port, () => {
        console.log(`========================================`);
        console.log(`Enhanced Web Crawler running on port ${CONFIG.port}`);
        console.log(`URL: http://localhost:${CONFIG.port}/`);
        console.log(`Browser mode: VISIBLE`);
        console.log(`========================================`);
        console.log(`Ready for scan requests at:`);
        console.log(`http://localhost:${CONFIG.port}/deep-scan`);
        console.log(`Example usage: Send POST with JSON body: {"url":"https://example.com/"}`);
        console.log(`========================================`);
    });

    // Handle graceful shutdown
    function shutdown() {
        console.log('Server shutting down...');
        if (server) {
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
            
            // Force close after 5 seconds if not closed
            setTimeout(() => {
                console.error('Forcing server shutdown');
                process.exit(1);
            }, 5000);
        } else {
            process.exit(0);
        }
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

startServer();

// Store the last scan results
let lastScanResults = null;

// Add endpoint to retrieve the last scan results
app.get('/last-scan', (req, res) => {
    if (lastScanResults) {
        res.json(lastScanResults);
    } else {
        res.status(404).json({ error: 'No scan has been performed yet' });
    }
});