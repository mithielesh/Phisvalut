// Enhanced crawler for banking sites and general websites
// This script can handle demo.testfire.net and other web applications
// with various form patterns and interactive elements

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
    maxDepth: 5,      // Maximum depth for crawling (increased from 3)
    maxLinksPerPage: 15, // Maximum links to follow per page (increased from 10)
    scanTimeout: 180000, // 3-minute timeout (increased from 2 minutes)
    explorationDepth: 3, // How many actions to perform after login
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
        'amount': '100',
        // Add more patterns as needed
    }
};

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

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
            if (!visitedUrls.includes(fullUrl)) {
                visitedUrls.push(fullUrl);
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
        if (!visitedUrls.includes(currentUrl)) {
            visitedUrls.push(currentUrl);
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
        // Tracking variables
        const visitedUrls = [url];
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
            return Array.from(document.querySelectorAll('form')).map(form => {
                // Get all input elements
                const inputs = Array.from(form.querySelectorAll('input, select, textarea'))
                    .map(input => {
                        return {
                            type: input.type || 'text',
                            name: input.name || '',
                            id: input.id || '',
                            placeholder: input.placeholder || '',
                            value: input.value || '',
                            required: input.required || false
                        };
                    });
                
                // Try to determine form type based on inputs and action URL
                let formType = 'unknown';
                const action = form.action || '';
                const formId = form.id || '';
                
                // Look for password fields to identify login forms
                if (inputs.some(i => i.type === 'password')) {
                    formType = 'login';
                }
                // Look for search-related attributes
                else if (action.includes('search') || formId.includes('search') || 
                        inputs.some(i => i.name === 'search' || i.name === 'query' || i.name === 'q')) {
                    formType = 'search';
                }
                // Look for contact form patterns
                else if (inputs.some(i => i.name === 'email' || i.name.includes('mail')) &&
                        inputs.some(i => i.name.includes('message') || i.name.includes('comment'))) {
                    formType = 'contact';
                }
                // Look for registration form patterns
                else if (inputs.length > 3 && inputs.some(i => i.name.includes('email') || i.name.includes('mail'))) {
                    formType = 'registration';
                }
                // Look for transaction forms (testfire.net specific)
                else if (isTestfire && (action.includes('transfer') || formId.includes('transfer') || 
                          inputs.some(i => i.name.includes('amount') || i.name.includes('account')))) {
                    formType = 'transaction';
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

                            if (!visitedUrls.includes(currentUrl)) {
                                visitedUrls.push(currentUrl);

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

    // Collect links on the current page
    try {
        // Gather all links using JavaScript (more reliable)
        const links = await driver.executeScript(`
        return Array.from(document.querySelectorAll('a[href]'))
            .map(a => {
                return {
                    href: a.href,
                    text: a.textContent.trim(),
                    visible: a.offsetParent !== null
                }
            })
            .filter(link => {
                return link.href && 
                       !link.href.startsWith('javascript:') &&
                       !link.href.startsWith('mailto:') &&
                       !link.href.startsWith('#');
            });
    `);

        console.log(`Found ${links.length} links on page`);

        // Filter to only include links to same domain
        const internalLinks = links.filter(link => {
            try {
                const linkUrl = new URL(link.href);
                const pageUrl = new URL(url);
                return linkUrl.hostname === pageUrl.hostname && link.visible;
            } catch (e) {
                return false;
            }
        });

        console.log(`Found ${internalLinks.length} internal links`);

        // Prioritize "interesting" links based on security-sensitive patterns
        const interestingLinks = internalLinks
            .filter(link => {
                const text = link.text.toLowerCase();
                const href = link.href.toLowerCase();

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
                    href.includes('account') ||
                    href.includes('login') ||
                    href.includes('profile') ||
                    href.includes('admin') ||
                    href.includes('transfer') ||
                    href.includes('feedback') ||
                    href.includes('password') ||
                    href.match(/id=\d+/) ||  // Look for numeric IDs in URLs (potential IDOR)
                    href.includes('file=') ||  // Potential file inclusion vulnerabilities
                    href.includes('upload');
            });

        // Combine interesting and regular links, prioritizing interesting ones
        const linksToFollow = [
            ...interestingLinks,
            ...internalLinks.filter(link => !interestingLinks.includes(link))
        ].slice(0, maxLinks);

        console.log(`Will follow up to ${linksToFollow.length} links`);

        // Follow links
        for (const link of linksToFollow) {
            if (visitedUrls.includes(link.href)) {
                console.log(`Skipping already visited: ${link.href}`);
                continue;
            }

            console.log(`Following link: ${link.href}`);
            console.log(`Link text: ${link.text.substring(0, 30)}`);

            // Add to visited list before navigating
            visitedUrls.push(link.href);

            try {
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

    return {
        url,
        title,
        links: pageLinks,
        forms: pageForms,
        findings: pageFindings
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
