// Helper function for handling iframes
async function processIframes(driver, url, visitedUrls, depth, maxDepth, maxLinks, findings, forms) {
    try {
        // Detect iframes in the page
        const iframes = await driver.findElements(By.css('iframe'));
        console.log(`Found ${iframes.length} iframes on page`);
        
        if (iframes.length === 0) return;
        
        // Process each iframe
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            
            try {
                console.log(`Processing iframe ${i + 1} of ${iframes.length}`);
                
                // Get iframe source and other attributes
                const src = await iframe.getAttribute('src').catch(() => '');
                const id = await iframe.getAttribute('id').catch(() => '');
                const name = await iframe.getAttribute('name').catch(() => '');
                
                console.log(`Iframe source: ${src || 'No src attribute'}`);
                console.log(`Iframe id: ${id || 'No id attribute'}`);
                console.log(`Iframe name: ${name || 'No name attribute'}`);
                
                // Skip empty, about:blank, or javascript: iframes
                if (!src || src === 'about:blank' || src.startsWith('javascript:')) {
                    console.log('Skipping empty or javascript iframe');
                    continue;
                }
                
                // Skip already visited iframe URLs
                if (visitedUrls.includes(src)) {
                    console.log('Skipping already visited iframe URL');
                    continue;
                }
                
                // Try to switch to iframe context
                await driver.switchTo().frame(iframe);
                console.log('Successfully switched to iframe context');
                
                // Check if iframe has forms
                const formElements = await driver.findElements(By.css('form')).catch(() => []);
                console.log(`Found ${formElements.length} forms in iframe`);
                
                if (formElements.length > 0) {
                    console.log('Processing forms in iframe');
                    
                    // Analyze each form
                    for (const formElement of formElements) {
                        try {
                            // Get form attributes
                            const action = await formElement.getAttribute('action').catch(() => '');
                            const method = await formElement.getAttribute('method').catch(() => 'get');
                            const id = await formElement.getAttribute('id').catch(() => '');
                            
                            console.log(`Form action: ${action}, method: ${method}, id: ${id || 'No id'}`);
                            
                            // Get form fields
                            const inputElements = await formElement.findElements(By.css('input, select, textarea'));
                            console.log(`Found ${inputElements.length} input fields in form`);
                            
                            // Process each field
                            let filledFields = 0;
                            
                            for (const inputElement of inputElements) {
                                try {
                                    const type = await inputElement.getAttribute('type').catch(() => '');
                                    const name = await inputElement.getAttribute('name').catch(() => '');
                                    const id = await inputElement.getAttribute('id').catch(() => '');
                                    
                                    // Skip hidden, submit, button fields
                                    if (type === 'hidden' || type === 'submit' || type === 'button') {
                                        continue;
                                    }
                                    
                                    // Determine value based on field attributes
                                    let valueToUse = '';
                                    
                                    if (type === 'email' || name.includes('email') || id.includes('email')) {
                                        valueToUse = CONFIG.formFillPatterns.email;
                                    } else if (type === 'password' || name.includes('password') || id.includes('password')) {
                                        valueToUse = CONFIG.formFillPatterns.password;
                                    } else if (name.includes('name') || id.includes('name')) {
                                        valueToUse = CONFIG.formFillPatterns.name;
                                    } else if (type === 'text') {
                                        valueToUse = `Test value for ${name || id || 'field'}`;
                                    } else if (type === 'tel' || name.includes('phone') || id.includes('phone')) {
                                        valueToUse = CONFIG.formFillPatterns.phone;
                                    }
                                    
                                    // Fill the field if we have a value
                                    if (valueToUse) {
                                        await inputElement.clear();
                                        await inputElement.sendKeys(valueToUse);
                                        console.log(`Filled field ${name || id || 'unnamed'} in iframe form`);
                                        filledFields++;
                                    }
                                } catch (fieldError) {
                                    console.log(`Error filling field in iframe form: ${fieldError.message}`);
                                }
                            }
                            
                            // Try to submit the form if we filled fields
                            if (filledFields > 0) {
                                try {
                                    // Find submit button
                                    const submitButton = await formElement.findElement(By.css('input[type="submit"], button[type="submit"]')).catch(() => null);
                                    
                                    if (submitButton) {
                                        console.log('Submitting iframe form');
                                        await submitButton.click();
                                        await driver.sleep(2000); // Wait for form submission
                                    } else {
                                        console.log('No submit button found in iframe form');
                                    }
                                } catch (submitError) {
                                    console.log(`Error submitting iframe form: ${submitError.message}`);
                                }
                            }
                        } catch (formError) {
                            console.log(`Error processing form in iframe: ${formError.message}`);
                        }
                    }
                }
                
                // Collect iframe findings
                const iframeFindings = {
                    type: 'iframe_content',
                    url: src,
                    forms: formElements.length,
                    frameId: id || name || `iframe_${i}`
                };
                
                findings.push(iframeFindings);
                
                // Switch back to main frame
                await driver.switchTo().defaultContent();
                console.log('Switched back to main document');
                
            } catch (iframeError) {
                console.log(`Error processing iframe: ${iframeError.message}`);
                // Make sure we get back to the main document
                await driver.switchTo().defaultContent().catch(() => {});
            }
        }
    } catch (e) {
        console.log(`Error in iframe processing: ${e.message}`);
        // Make sure we get back to the main document
        await driver.switchTo().defaultContent().catch(() => {});
    }
}

module.exports = { processIframes };
