// Enhanced crawler for banking sites and general websites
// This script can handle demo.testfire.net and other web applications
// with various form patterns and interactive elements

const express = require('express');
const cors = require('cors');
const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');
const { processIframes } = require('./iframeHandler');

// Server configuration
const CONFIG = {
    port: 3000,
    headless: false,  // Always run in visible mode to see browser activity
    slowMo: 100,      // Add delay between actions (ms)
    maxDepth: 5,      // Maximum depth for crawling (increased from 3)
    maxLinksPerPage: 25, // Maximum links to follow per page (increased from 15)
    scanTimeout: 240000, // 4-minute timeout (increased from 3 minutes)
    explorationDepth: 4, // How many actions to perform after login (increased from 3)
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
    submitAllForms: true // Try to submit all forms found, not just ones we recognize
};

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Store all activity logs for AI analysis
const activityLogs = [];

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

// New function to explore testfire after successful login
async function exploreTestfireAfterLogin(driver, visitedUrls) {
    console.log('🔍 Exploring Testfire bank site after successful login');

    // Important actions to perform after login
    const actionsToPerform = [
        {
            name: "View Account Summary",
            path: "/bank/main.jsp",
            action: async () => {
                console.log("Viewing account summary");
                // Just need to navigate to the page
            }
        },
        {
            name: "View Account Details",
            path: "/bank/account.jsp",
            action: async () => {
                console.log("Viewing account details");
                // Try to select an account
                try {
                    const accountLinks = await driver.findElements(By.css('a[href*="account.jsp"]'));
                    if (accountLinks && accountLinks.length > 0) {
                        await accountLinks[0].click();
                        console.log("Clicked on first account");
                        await driver.sleep(1000);
                    }
                } catch (e) {
                    console.log("Could not select account: " + e.message);
                }
            }
        },
        {
            name: "Perform Transfer",
            path: "/bank/transfer.jsp",
            action: async () => {
                console.log("Attempting to perform a transfer");
                try {
                    // Find from account dropdown
                    const fromAccount = await driver.findElement(By.name("fromAccount"));
                    await driver.executeScript(
                        "arguments[0].selectedIndex = 0; arguments[0].dispatchEvent(new Event('change'))",
                        fromAccount
                    );

                    // Find to account dropdown
                    const toAccount = await driver.findElement(By.name("toAccount"));
                    await driver.executeScript(
                        "arguments[0].selectedIndex = 1; arguments[0].dispatchEvent(new Event('change'))",
                        toAccount
                    );

                    // Set amount
                    const amountField = await driver.findElement(By.name("transferAmount"));
                    await amountField.clear();
                    await amountField.sendKeys("100.00");

                    // Click transfer button
                    const transferButton = await driver.findElement(By.name("transfer"));
                    await transferButton.click();
                    console.log("Transfer form submitted");
                    await driver.sleep(2000);

                    // Take screenshot of result
                    await driver.takeScreenshot().then(data => {
                        fs.writeFileSync(path.join(__dirname, 'screenshots', `transfer_result_${Date.now()}.png`), data, 'base64');
                    });
                } catch (e) {
                    console.log("Transfer error: " + e.message);
                }
            }
        },
        {
            name: "View Profile",
            path: "/bank/main.jsp?content=profile.jsp",
            action: async () => {
                console.log("Viewing user profile");
                // Just navigate to the page
            }
        },
        {
            name: "View Recent Transactions",
            path: "/bank/transaction.jsp",
            action: async () => {
                console.log("Viewing recent transactions");
                // Just navigate to the page
            }
        }
    ];

    // Current URL to determine the base
    const currentUrl = await driver.getCurrentUrl();
    const baseUrl = new URL(currentUrl).origin;

    // Perform each action
    for (const action of actionsToPerform) {
        const fullUrl = baseUrl + action.path;
        console.log(`\n🔹 Action: ${action.name} at ${fullUrl}`);

        try {
            // Navigate to the page
            await driver.get(fullUrl);
            await driver.wait(until.elementLocated(By.css('body')), 10000);

            // Add to visited URLs
            const normalizedUrl = normalizeUrl(fullUrl);
            if (!visitedUrls.has(normalizedUrl)) {
                visitedUrls.add(normalizedUrl);
            }

            // Take screenshot
            await driver.takeScreenshot().then(data => {
                fs.writeFileSync(path.join(__dirname, 'screenshots', `${action.name.replace(/\s+/g, '_')}_${Date.now()}.png`), data, 'base64');
            });

            // Perform the action
            await action.action();

        } catch (e) {
            console.log(`Error performing action "${action.name}": ${e.message}`);
        }

        // Brief pause between actions
        await driver.sleep(1000);
    }

    console.log('✅ Completed post-login exploration of testfire site');
}

// Function to directly login to testfire.net before scanning
async function directTestfireLogin(driver, visitedUrls) {
    try {
        console.log('Attempting direct login to testfire.net');

        // Go to the login page
        await driver.get('https://demo.testfire.net/login.jsp');
        await driver.wait(until.elementLocated(By.css('body')), 10000);
        console.log('Loaded login page');

        // Find and fill username and password
        const usernameField = await driver.findElement(By.name('uid'));
        const passwordField = await driver.findElement(By.name('passw'));

        await usernameField.clear();
        await usernameField.sendKeys('admin');
        await passwordField.clear();
        await passwordField.sendKeys('admin');

        console.log('Filled login credentials');

        // Take screenshot to verify login form is filled
        const screenshotPath = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotPath)) {
            fs.mkdirSync(screenshotPath);
        }

        await driver.takeScreenshot().then(data => {
            fs.writeFileSync(path.join(screenshotPath, `login_form_${Date.now()}.png`), data, 'base64');
        });

        // Click login button
        const loginButton = await driver.findElement(By.name('btnSubmit'));
        await loginButton.click();

        // Wait for login to complete
        await driver.sleep(3000);

        // Check if login was successful
        const currentUrl = await driver.getCurrentUrl();
        console.log(`After login attempt, we're at: ${currentUrl}`);

        // Add this page to visited URLs
        const normalizedUrl = normalizeUrl(currentUrl);
        if (!visitedUrls.has(normalizedUrl)) {
            visitedUrls.add(normalizedUrl);
        }

        // Take screenshot after login
        await driver.takeScreenshot().then(data => {
            fs.writeFileSync(path.join(screenshotPath, `after_login_${Date.now()}.png`), data, 'base64');
        });

        // Verify login by checking for logout link or account info
        const isLoggedIn = await driver.executeScript(`
            return document.body.textContent.includes('Sign Off') ||
                   document.body.textContent.includes('Hello Admin User') ||
                   document.body.textContent.includes('MY ACCOUNT');
        `);

        if (isLoggedIn) {
            console.log('✓ Login successful - user is authenticated');

            // Now explore the authenticated areas
            await exploreTestfireAfterLogin(driver, visitedUrls);

            return true;
        } else {
            console.log('✗ Login appears to have failed');
            return false;
        }
    } catch (error) {
        console.error('Error during direct login:', error.message);
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

    // Tracking variables - using Set for more efficient lookups
    const visitedUrls = new Set([normalizeUrl(url)]);
    const findings = [];
        const forms = [];

        // First handle testfire.net login if that's the target site
        if (url.includes('testfire.net')) {
            // Direct login to testfire.net before scanning
            console.log('Detected testfire.net - attempting direct login first');
            await directTestfireLogin(driver, visitedUrls);
        }

        // Navigate to start URL
        console.log(`Navigating to ${url}`);
        await driver.get(url);
        await driver.wait(until.elementLocated(By.css('body')), 10000);
        console.log(`Successfully loaded ${url}`);        // Take screenshot for verification
        const screenshotPath = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotPath)) {
            fs.mkdirSync(screenshotPath);
        }

        await driver.takeScreenshot().then(data => {
            fs.writeFileSync(path.join(screenshotPath, `initial_page_${Date.now()}.png`), data, 'base64');
        });

        // Start scanning from the initial URL
        const results = await crawlPage(driver, url, visitedUrls, 0, maxDepth, maxLinks, findings, forms);

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
async function crawlPage(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms) {
    console.log(`Crawling page: ${url} (depth ${depth}/${maxDepth})`);

    // Get page info
    const title = await safeOperation(async () => await driver.getTitle(), 'Unknown Title');
    console.log(`Page title: ${title}`);

    const pageLinks = [];
    const pageForms = [];
    const pageFindings = [];

    // Check if this is a testfire.net page
    const isTestfire = url.includes('testfire.net');
    let isLoggedIn = false;

    // Process forms - with special handling for known sites
    console.log('Detecting and processing forms');

    // First, let's detect all forms on the page using JavaScript
    try {
        const formInfo = await driver.executeScript(`
            // Function to check if element has form-like class or ID
            function hasFormRelatedAttribute(element) {
                if (!element) return false;
                
                // Check class attribute
                if (element.className && typeof element.className === 'string') {
                    const classLower = element.className.toLowerCase();
                    return classLower.includes('form') || classLower.includes('login') || 
                           classLower.includes('feedback') || classLower.includes('contact') || 
                           classLower.includes('comment') || classLower.includes('suggestion') ||
                           classLower.includes('guestbook') || classLower.includes('inquir');
                }
                
                // Check ID attribute
                if (element.id && typeof element.id === 'string') {
                    const idLower = element.id.toLowerCase();
                    return idLower.includes('form') || idLower.includes('login') || 
                           idLower.includes('feedback') || idLower.includes('contact') || 
                           idLower.includes('comment') || idLower.includes('suggestion') ||
                           idLower.includes('guestbook') || idLower.includes('inquir');
                }
                
                return false;
            }
            
            // Find both traditional forms and form-like structures
            const traditionalForms = Array.from(document.querySelectorAll('form'));
            
            // Find div-based forms with more comprehensive selectors
            const formLikeDivs = Array.from(document.querySelectorAll(
                // Common form class patterns
                'div.form, div[class*="form"], div[id*="form"], ' + 
                'div[class*="login"], div[id*="login"], ' + 
                // Common authentication-related forms
                'div[class*="auth"], div[id*="auth"], div[class*="register"], div[id*="register"], ' +
                // Common contact/feedback forms
                'div[class*="feedback"], div[class*="contact"], div[class*="comment"], ' +
                'div[class*="suggestion"], div.guestbook, div#guestbook, ' +
                // Inquiry and support forms
                'div[class*="inquir"], div[id*="inquir"], div[class*="support"], div[id*="support"], ' +
                // Search forms
                'div[class*="search"], div[id*="search"], ' +
                // Booking and reservation forms
                'div[class*="book"], div[id*="book"], div[class*="reserv"], div[id*="reserv"], ' +
                // Payment and checkout forms
                'div[class*="payment"], div[id*="payment"], div[class*="checkout"], div[id*="checkout"], ' +
                // Newsletter and subscription forms
                'div[class*="subscribe"], div[id*="subscribe"], div[class*="newsletter"], div[id*="newsletter"]'
            )).filter(div => div.querySelectorAll('input, textarea, select, button').length > 0);
            
            // Also look for forms disguised as other elements - find groups of inputs in any container
            const potentialFormContainers = Array.from(document.querySelectorAll('section, article, div'))
                .filter(container => {
                    // Must have at least a text field and a button or at least a textarea
                    const hasTextInput = container.querySelector('input[type="text"], input:not([type])');
                    const hasTextarea = container.querySelector('textarea');
                    const hasButton = container.querySelector('button, input[type="submit"], input[type="button"]');
                    
                    return (hasTextarea || (hasTextInput && hasButton)) && 
                           !traditionalForms.some(form => form.contains(container)) &&
                           !formLikeDivs.some(div => div.contains(container));
                });
            
            // Process all form-like elements
            return [...traditionalForms, ...formLikeDivs, ...potentialFormContainers].map(form => {
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
                        form.className?.includes('search') ||
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
                else if ((isTestfire && (action?.includes('transfer') || formId?.includes('transfer') || 
                          inputs.some(i => i.name?.includes('amount') || i.name?.includes('account')))) ||
                         action?.includes('transaction') || form.id?.includes('transaction') || 
                         form.className?.includes('transaction') || form.className?.includes('payment') ||
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
                        form.id?.includes('comment') || form.className?.includes('comment') ||
                        form.id?.includes('feedback') || form.className?.includes('feedback') ||
                        form.id?.includes('guestbook') || form.className?.includes('guestbook') ||
                        form.id?.includes('suggestion') || form.className?.includes('suggestion') ||
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
                    formType: formType
                };
            });
        `);

        console.log(`Found ${formInfo.length} forms on the page`);

        // Process each detected form
        for (const form of formInfo) {
            console.log(`Processing ${form.formType} form with ${form.inputs.length} fields`);
            pageForms.push({
                type: form.formType,
                url: url,
                fields: form.inputs.length,
                processed: false
            });

            // Special handling for testfire.net login form
            if (isTestfire && form.formType === 'login' && url.includes('login.jsp')) {
                console.log('Processing testfire login form');

                try {
                    // Find username and password fields
                    const usernameField = await safeOperation(async () =>
                        await driver.findElement(By.name('uid')));
                    const passwordField = await safeOperation(async () =>
                        await driver.findElement(By.name('passw')));

                    if (usernameField && passwordField) {
                        console.log('Found login form, filling credentials');

                        // Fill the form
                        await usernameField.sendKeys('admin');
                        await passwordField.sendKeys('admin');

                        // Find and click the login button
                        const loginButton = await safeOperation(async () =>
                            await driver.findElement(By.name('btnSubmit')));

                        if (loginButton) {
                            await loginButton.click();
                            console.log('Login form submitted');

                            // Wait for navigation
                            await driver.sleep(2000);

                            // Check if we're logged in
                            const currentUrl = await driver.getCurrentUrl();
                            console.log(`After login, we're at: ${currentUrl}`);
                            isLoggedIn = true;

                            // Mark form as processed
                            pageForms[pageForms.length - 1].processed = true;

                            const normalizedUrl = normalizeUrl(currentUrl);
                            if (!visitedUrls.has(normalizedUrl)) {
                                visitedUrls.add(normalizedUrl);

                                // Recursively scan the new page if we're not too deep
                                if (depth < maxDepth) {
                                    console.log(`Following post-login to ${currentUrl}`);
                                    await crawlPage(driver, currentUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);

                                    // After successful login, perform additional exploration of the site
                                    // since we're now logged in and can access protected areas
                                    if (isTestfire) {
                                        await exploreLoggedInTestfireSite(driver, visitedUrls, depth, maxDepth, maxLinks, findings, forms);
                                    }
                                }
                            }
                        }
                    }
                } catch (loginError) {
                    console.log(`Login process error: ${loginError.message}`);
                }
            }
            // Handle search forms
            else if (form.formType === 'search') {
                try {
                    // Find search field by common patterns
                    const searchField = await safeOperation(async () => {
                        // Try different possible search field selectors
                        const selectors = [
                            By.name('query'),
                            By.name('q'),
                            By.name('search'),
                            By.id('search'),
                            By.css('input[type="search"]'),
                            By.css('input[placeholder*="search" i]'),
                            By.css('input[placeholder*="find" i]')
                        ];

                        for (const selector of selectors) {
                            const element = await driver.findElement(selector).catch(() => null);
                            if (element) return element;
                        }
                        return null;
                    });

                    if (searchField) {
                        console.log('Found search form');
                        // Mark form as processed
                        pageForms[pageForms.length - 1].processed = true;

                        // Fill and submit search form
                        await searchField.sendKeys(CONFIG.formFillPatterns.search);

                        // Look for search button using common patterns
                        const searchButton = await safeOperation(async () => {
                            // Try different possible submit button selectors
                            const selectors = [
                                By.css('input[value="Go"]'),
                                By.css('input[value="Search"]'),
                                By.css('button[type="submit"]'),
                                By.css('input[type="submit"]'),
                                By.css('button:has(i.fa-search)'),
                                By.css('.search-button'),
                                By.css('#search-button')
                            ];

                            for (const selector of selectors) {
                                const element = await driver.findElement(selector).catch(() => null);
                                if (element) return element;
                            }
                            return null;
                        });

                        if (searchButton) {
                            await searchButton.click();
                            console.log('Search form submitted');

                            // Wait for navigation
                            await driver.sleep(2000);

                            // Check if we're on a new page
                            const searchResultUrl = await driver.getCurrentUrl();
                            console.log(`After search, we're at: ${searchResultUrl}`);

                            if (!visitedUrls.includes(searchResultUrl)) {
                                visitedUrls.push(searchResultUrl);

                                // Recursively scan the search results page if we're not too deep
                                if (depth < maxDepth) {
                                    console.log(`Following search results to ${searchResultUrl}`);
                                    await crawlPage(driver, searchResultUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
                                }
                            }
                        } else {
                            // If we couldn't find a search button, try pressing Enter key
                            await searchField.sendKeys(Key.RETURN);
                            console.log('Submitted search with Enter key');

                            // Wait for navigation
                            await driver.sleep(2000);

                            // Check if we're on a new page
                            const searchResultUrl = await driver.getCurrentUrl();
                            console.log(`After search, we're at: ${searchResultUrl}`);

                            if (!visitedUrls.includes(searchResultUrl)) {
                                visitedUrls.push(searchResultUrl);

                                // Recursively scan the search results page if we're not too deep
                                if (depth < maxDepth) {
                                    console.log(`Following search results to ${searchResultUrl}`);
                                    await crawlPage(driver, searchResultUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
                                }
                            }
                        }
                    }
                } catch (searchError) {
                    console.log(`Search form error: ${searchError.message}`);
                }
            }
            // Handle transaction forms (testfire specific)
            else if (isTestfire && form.formType === 'transaction') {
                try {
                    console.log('Processing transaction form');

                    // Try to fill all relevant fields
                    for (const input of form.inputs) {
                        if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
                            continue;
                        }

                        // Try to determine what value to use based on field name
                        let valueToUse = '100';

                        if (input.name.includes('amount')) {
                            valueToUse = '100.00';
                        } else if (input.name.includes('account') || input.name.includes('to')) {
                            valueToUse = '800001';
                        } else if (input.name.includes('from')) {
                            valueToUse = '800000';
                        }

                        try {
                            // Find and fill the field
                            const field = await safeOperation(async () =>
                                await driver.findElement(By.name(input.name)));

                            if (field) {
                                await field.clear();
                                await field.sendKeys(valueToUse);
                                console.log(`Filled field ${input.name} with ${valueToUse}`);
                            }
                        } catch (fieldError) {
                            console.log(`Error filling field ${input.name}: ${fieldError.message}`);
                        }
                    }

                    // Find submit button
                    const submitButton = await safeOperation(async () => {
                        // Try different possible submit button selectors
                        const selectors = [
                            By.name('btnSubmit'),
                            By.css('input[type="submit"]'),
                            By.css('button[type="submit"]'),
                            By.css('input[value*="Transfer"]'),
                            By.css('input[value*="Submit"]'),
                            By.css('button:contains("Submit")'),
                            By.css('button:contains("Transfer")')
                        ];

                        for (const selector of selectors) {
                            try {
                                const element = await driver.findElement(selector);
                                if (element) return element;
                            } catch (e) {
                                // Continue trying selectors
                            }
                        }
                        return null;
                    });

                    if (submitButton) {
                        pageForms[pageForms.length - 1].processed = true;
                        await submitButton.click();
                        console.log('Transaction form submitted');

                        // Wait for navigation
                        await driver.sleep(2000);

                        // Check if we're on a new page
                        const resultUrl = await driver.getCurrentUrl();
                        console.log(`After submission, we're at: ${resultUrl}`);

                        if (!visitedUrls.includes(resultUrl)) {
                            visitedUrls.push(resultUrl);

                            // Recursively scan the results page if we're not too deep
                            if (depth < maxDepth) {
                                console.log(`Following form submission to ${resultUrl}`);
                                await crawlPage(driver, resultUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
                            }
                        }
                    }
                } catch (formError) {
                    console.log(`Transaction form error: ${formError.message}`);
                }
            }
            // Handle feedback/contact forms
            else if ((form.formType === 'feedback' || form.formType === 'contact') && !form.processed) {
                try {
                    console.log('Processing feedback/contact form');
                    let filledFields = 0;

                    // Try to fill all relevant fields based on their name/id attributes
                    for (const input of form.inputs) {
                        if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
                            continue;
                        }

                        // Determine appropriate value based on field type
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
                        // Default for text fields
                        else if (input.type === 'text') {
                            valueToUse = 'Test value for ' + (input.name || input.id || 'text field');
                        }

                        if (valueToUse) {
                            try {
                                // Use our enhanced helper function to find the field
                                const field = await findFormElement(driver, input, CONFIG.formFillPatterns);

                                if (field) {
                                    // Check if it's a textarea which may need different handling
                                    const tagName = await field.getTagName();
                                    
                                    // Clear existing content
                                    await field.clear();
                                    
                                    // Some textareas need different handling
                                    if (tagName.toLowerCase() === 'textarea') {
                                        // For textareas, sometimes we need JavaScript to set the value
                                        await driver.executeScript(`arguments[0].value = arguments[1]`, field, valueToUse);
                                    } else {
                                        await field.sendKeys(valueToUse);
                                    }
                                    
                                    console.log(`Filled ${input.type} field (${input.name || input.id || 'unnamed'}) with value`);
                                    filledFields++;
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
                            console.log('Feedback form submitted');

                            // Wait for navigation or confirmation
                            await driver.sleep(2000);

                            // Check if we're on a new page or if there's a success message
                            const resultUrl = await driver.getCurrentUrl();
                            const successMessage = await safeOperation(async () => {
                                const messageElements = await driver.findElements(By.css('.success, .alert-success, [role="alert"]'));
                                return messageElements.length > 0;
                            });

                            console.log(`After form submission: ${resultUrl} (success: ${successMessage})`);

                            if (!visitedUrls.includes(resultUrl)) {
                                visitedUrls.push(resultUrl);

                                // Recursively scan the results page if we're not too deep
                                if (depth < maxDepth) {
                                    await crawlPage(driver, resultUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
                                }
                            }
                        } else {
                            console.log('No submit button found for feedback form');
                        }
                    }
                } catch (formError) {
                    console.log(`Feedback form processing error: ${formError.message}`);
                }
            }
            // Generic form handling for other forms
            else if (form.formType !== 'login' && !form.processed) {
                try {
                    console.log(`Processing general form of type: ${form.formType}`);
                    let filledFields = 0;

                    // Try to fill all relevant fields
                    for (const input of form.inputs) {
                        if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
                            continue;
                        }

                        // Try to determine what value to use based on field attributes
                        let valueToUse = '';

                        // Match known field types to values
                        for (const [pattern, value] of Object.entries(CONFIG.formFillPatterns)) {
                            if (input.name.toLowerCase().includes(pattern.toLowerCase()) ||
                                input.id.toLowerCase().includes(pattern.toLowerCase()) ||
                                input.placeholder.toLowerCase().includes(pattern.toLowerCase())) {
                                valueToUse = value;
                                break;
                            }
                        }

                        // If we couldn't determine a specific value, use a generic one
                        if (!valueToUse) {
                            if (input.type === 'email') {
                                valueToUse = CONFIG.formFillPatterns.email;
                            } else if (input.type === 'password') {
                                valueToUse = CONFIG.formFillPatterns.password;
                            } else if (input.type === 'text') {
                                valueToUse = 'test_value';
                            } else if (input.type === 'number') {
                                valueToUse = '42';
                            } else if (input.type === 'tel') {
                                valueToUse = CONFIG.formFillPatterns.phone;
                            }
                        }

                        if (valueToUse) {
                            try {
                                // Find and fill the field
                                const field = await safeOperation(async () =>
                                    input.id ? await driver.findElement(By.id(input.id)) :
                                        input.name ? await driver.findElement(By.name(input.name)) : null);

                                if (field) {
                                    await field.clear();
                                    await field.sendKeys(valueToUse);
                                    console.log(`Filled field ${input.name || input.id} with a value`);
                                    filledFields++;
                                }
                            } catch (fieldError) {
                                console.log(`Error filling field ${input.name || input.id}: ${fieldError.message}`);
                            }
                        }
                    }

                    // If we filled at least one field, try to submit the form
                    if (filledFields > 0) {
                        // Find submit button
                        const submitButton = await safeOperation(async () => {
                            // Try different possible submit button selectors
                            const selectors = [
                                By.css('input[type="submit"]'),
                                By.css('button[type="submit"]'),
                                By.css('button.submit'),
                                By.css('.btn-submit'),
                                By.css('input[value*="Submit"]'),
                                By.css('button:contains("Submit")')
                            ];

                            for (const selector of selectors) {
                                try {
                                    const element = await driver.findElement(selector);
                                    if (element) return element;
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

                            // Wait for navigation
                            await driver.sleep(2000);

                            // Check if we're on a new page
                            const resultUrl = await driver.getCurrentUrl();
                            console.log(`After form submission, we're at: ${resultUrl}`);

                            if (!visitedUrls.includes(resultUrl)) {
                                visitedUrls.push(resultUrl);

                                // Recursively scan the results page if we're not too deep
                                if (depth < maxDepth) {
                                    console.log(`Following form submission to ${resultUrl}`);
                                    await crawlPage(driver, resultUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
                                }
                            }
                        }
                    }
                } catch (formError) {
                    console.log(`General form error: ${formError.message}`);
                }
            }
        }
    } catch (formDetectionError) {
        console.log(`Error detecting forms: ${formDetectionError.message}`);
    }

    // Original function kept for compatibility
    async function exploreLoggedInTestfireSite(driver, visitedUrls, depth, maxDepth, maxLinks, findings, forms) {
        console.log('Starting post-login exploration of testfire site');

        // Priority pages to visit after login
        const priorityPaths = [
            '/bank/main.jsp',
            '/bank/account.jsp',
            '/bank/transfer.jsp',
            '/bank/transaction.jsp',
            '/bank/profile.jsp',
            '/bank/customize.jsp'
        ];        // Current URL to determine the base
        const currentUrl = await driver.getCurrentUrl();
        const baseUrl = new URL(currentUrl).origin;

        // Visit each priority page
        for (const path of priorityPaths) {
            const fullUrl = baseUrl + path;
            console.log(`Exploring logged-in area: ${fullUrl}`);

            if (visitedUrls.includes(fullUrl)) {
                console.log(`Already visited ${fullUrl}, skipping`);
                continue;
            }

            try {
                // Navigate to the page
                await driver.get(fullUrl);
                await driver.wait(until.elementLocated(By.css('body')), 10000);
                visitedUrls.push(fullUrl);

                // Perform page-specific actions
                if (path === '/bank/transfer.jsp') {
                    console.log('On transfer page, will attempt a transfer');

                    // Try to find and fill the transfer form
                    try {
                        // Fill amount field
                        const amountField = await safeOperation(async () =>
                            await driver.findElement(By.name('transferAmount')));

                        if (amountField) {
                            await amountField.clear();
                            await amountField.sendKeys('100.00');

                            // Find from account dropdown
                            const fromAccount = await safeOperation(async () =>
                                await driver.findElement(By.name('fromAccount')));

                            if (fromAccount) {
                                // Select first option
                                await driver.executeScript(
                                    "arguments[0].selectedIndex = 0; arguments[0].dispatchEvent(new Event('change'))",
                                    fromAccount
                                );

                                // Find to account dropdown
                                const toAccount = await safeOperation(async () =>
                                    await driver.findElement(By.name('toAccount')));

                                if (toAccount) {
                                    // Select second option
                                    await driver.executeScript(
                                        "arguments[0].selectedIndex = 1; arguments[0].dispatchEvent(new Event('change'))",
                                        toAccount
                                    );

                                    // Submit the form
                                    const submitButton = await safeOperation(async () =>
                                        await driver.findElement(By.name('transfer')));

                                    if (submitButton) {
                                        await submitButton.click();
                                        console.log('Transfer form submitted');

                                        // Wait for navigation
                                        await driver.sleep(2000);
                                    }
                                }
                            }
                        }
                    } catch (transferError) {
                        console.log(`Error during transfer: ${transferError.message}`);
                    }
                }
                else if (path === '/bank/account.jsp') {
                    console.log('On accounts page, will attempt to view account details');

                    // Try to click on account links
                    try {
                        // Find all account links
                        const accountLinks = await safeOperation(async () =>
                            await driver.findElements(By.css('a[href*="account.jsp"]')));

                        if (accountLinks && accountLinks.length > 0) {
                            // Click the first account link
                            await accountLinks[0].click();
                            console.log('Clicked on account link');

                            // Wait for navigation
                            await driver.sleep(2000);

                            // Check if we can view transactions
                            const transactionLinks = await safeOperation(async () =>
                                await driver.findElements(By.css('a[href*="transaction.jsp"]')));

                            if (transactionLinks && transactionLinks.length > 0) {
                                await transactionLinks[0].click();
                                console.log('Clicked on transaction link');

                                // Wait for navigation
                                await driver.sleep(2000);
                            }
                        }
                    } catch (accountError) {
                        console.log(`Error exploring accounts: ${accountError.message}`);
                    }
                }

                // Crawl this page normally
                if (depth < maxDepth) {
                    await crawlPage(driver, fullUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
                }

                // Navigate back to main page between priority explorations
                await driver.get(baseUrl + '/bank/main.jsp');
                await driver.wait(until.elementLocated(By.css('body')), 10000);

            } catch (navigationError) {
                console.log(`Error navigating to ${fullUrl}: ${navigationError.message}`);

                // Try to get back to main page
                try {
                    await driver.get(baseUrl + '/bank/main.jsp');
                    await driver.wait(until.elementLocated(By.css('body')), 10000);
                } catch (e) {
                    console.log(`Failed to get back to main page: ${e.message}`);
                }
            }
        }

        console.log('Completed post-login exploration');
    }

    // Collect links and interactive elements on the current page
    try {
        // Gather all links and interactive elements using JavaScript (more reliable)
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
        
        // Collect standard links - including javascript links that might be important
        const standardLinks = Array.from(document.querySelectorAll('a[href]'))
            .map(a => {
                return {
                    href: a.href,
                    text: a.textContent.trim(),
                    visible: isVisible(a),
                    type: 'link',
                    // Save javascript: URLs for special handling
                    jsAction: a.href.startsWith('javascript:') ? a.href : null
                }
            })
            .filter(link => {
                // Include all visible links except mailto: links
                // We're now including javascript: and # links
                return link.visible && !link.href.startsWith('mailto:');
            });
            
        // Collect link-like elements that might be JavaScript-powered navigation
        const linkLikeElements = Array.from(document.querySelectorAll(
            // Traditional navigation elements
            '.nav-item, .menu-item, [role="menuitem"], [role="tab"], .tab, li.active, .breadcrumb-item, ' +
            // Common components in UI libraries
            '.dropdown-item, .list-group-item, .card-header, [data-toggle], ' +
            // Angular/React/Vue style links
            '[ng-click], [v-on:click], [@click], [routerlink], [ui-sref], ' +
            // Common clickable patterns
            '.clickable, .selectable, .card.interactive, .accordion-header, .collapse-header'
        ))
            .filter(el => isVisible(el) && !el.querySelector('a[href]')) // Avoid duplicating standard links
            .map(el => {
                return {
                    element: el,
                    text: el.textContent.trim(),
                    visible: true,
                    type: 'interactive'
                };
            });
            
        // Collect buttons and other clickable elements
        const buttons = Array.from(document.querySelectorAll(
            // Standard buttons (excluding submit buttons which are handled by form processing)
            'button:not([type="submit"]), [role="button"]:not(a), ' +
            // Input elements that act as buttons
            'input[type="button"], input[type="image"], ' +
            // Icons and other elements commonly used as clickable items
            'i.fa, i.fas, i.far, i.fab, i.material-icons, ' +
            // Common SVG icon patterns
            'svg[class*="icon"], svg[role="img"]'
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
            
        // Look for any other element that has click handlers or appears clickable
        const otherClickables = Array.from(document.querySelectorAll('*'))
            .filter(el => 
                isVisible(el) && 
                isLikelyClickable(el) && 
                !el.matches('a[href], button, [role="button"], input[type="button"], input[type="submit"], input[type="image"]') &&
                !el.querySelector('a[href], button')
            )
            .map(el => {
                return {
                    element: el,
                    text: el.textContent.trim() || el.getAttribute('title') || el.getAttribute('aria-label') || 'Unlabeled Clickable',
                    visible: true,
                    type: 'interactive'
                };
            });
        
        return [...standardLinks, ...linkLikeElements, ...buttons, ...otherClickables];
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
            return !visitedUrls.has(normalizeUrl(link.href));
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
                const normalizedLinkUrl = normalizeUrl(link.href);
                if (visitedUrls.has(normalizedLinkUrl)) {
                    console.log(`Skipping already visited: ${link.href}`);
                    continue;
                }

                console.log(`Following link: ${link.href}`);
                console.log(`Link text: ${link.text.substring(0, 30)}`);

                // Add to visited list before navigating
                visitedUrls.add(normalizedLinkUrl);

                try {
                    // Take screenshot before navigation
                    await takeScreenshotWithHighlight(driver, link, 'before_click');
                    
                    // Navigate to the link
                    await driver.get(link.href);
                    await driver.wait(until.elementLocated(By.css('body')), 10000);

                    // Recursively scan the linked page
                    if (depth < maxDepth) {
                        await crawlPage(driver, link.href, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
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
                        if (newUrl !== url && !visitedUrls.includes(newUrl)) {
                            console.log(`Interactive element navigated to new URL: ${newUrl}`);
                            visitedUrls.push(newUrl);

                            // Recursively scan this new page
                            if (depth < maxDepth) {
                                await crawlPage(driver, newUrl, visitedUrls, depth + 1, maxDepth, maxLinks, findings, forms);
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
    // Check for iframes and process their contents if configured
    if (CONFIG.checkIframes) {
        await processIframes(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms);
    }
    
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
    
    // Create a detailed activity log for AI analysis
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
        console.log(`Visited ${results.visitedUrls.length} pages`);
        console.log(`Full results available at http://localhost:${CONFIG.port}/last-scan`);

        // Store the results for the /last-scan endpoint
        const fullResults = {
            url,
            visitedUrls: results.visitedUrls,
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

// AI Security Analysis endpoint
const AISecurityAnalyzer = require('./aiSecurityAnalyzer');

// Initialize the analyzer with the OpenAI config (will need API key)
const securityAnalyzer = new AISecurityAnalyzer({
    aiProvider: process.env.AI_PROVIDER || 'local', // Can be 'openai', 'anthropic', or 'local' 
    apiKey: process.env.OPENAI_API_KEY || '', // Replace or use environment variable
    modelName: 'gpt-4-turbo-preview', // or 'gpt-3.5-turbo' for faster, cheaper analysis
});

app.post('/analyze-security', async (req, res) => {
    try {
        // Ensure we have scan data to analyze
        if (activityLogs.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'No scan data available. Please run a scan first.'
            });
        }
        
        // Prepare complete scan data
        const scanData = {
            url: req.body.url || activityLogs[0].url,
            title: activityLogs[0].title,
            activityLogs: activityLogs,
            forms: activityLogs.flatMap(log => log.forms || []),
            links: activityLogs.flatMap(log => log.links || []),
            findings: activityLogs.flatMap(log => log.findings || []),
        };
        
        console.log(`Analyzing security for ${scanData.url} with ${activityLogs.length} pages of data`);
        
        // Get AI analysis
        const analysisResult = await securityAnalyzer.analyze(scanData);
        
        // Return the result
        res.json({
            status: 'success',
            securityAnalysis: analysisResult,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Security analysis error:', error);
        res.status(500).json({
            status: 'error',
            message: `Analysis failed: ${error.message}`
        });
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
const server = app.listen(CONFIG.port, () => {
    console.log(`========================================`);
    console.log(`Enhanced Web Crawler running on port ${CONFIG.port}`);
    console.log(`URL: http://localhost:${CONFIG.port}/`);
    console.log(`Browser mode: VISIBLE`);
    console.log(`========================================`);
    console.log(`Ready for scan requests at:`);
    console.log(`http://localhost:${CONFIG.port}/deep-scan`);
    console.log(`Example usage: Send POST with JSON body: {"url":"https://demo.testfire.net/"}`);
    console.log(`========================================`);
});

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

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Server shutting down');
    server.close();
});

process.on('SIGINT', () => {
    console.log('Server shutting down');
    server.close();
});
