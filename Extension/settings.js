// PhishVault Settings Page JavaScript

document.addEventListener('DOMContentLoaded', function () {
    const geminiApiKeyInput = document.getElementById('geminiApiKey');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');

    // Load existing settings
    loadSettings();

    // Save settings when the button is clicked
    saveBtn.addEventListener('click', saveSettings);

    function loadSettings() {
        chrome.storage.local.get(['secureAPIKeys'], function (result) {
            if (chrome.runtime.lastError) {
                showStatus('Error loading settings: ' + chrome.runtime.lastError.message, 'error');
            } else if (result && result.secureAPIKeys) {
                // Set Gemini API key if available
                if (result.secureAPIKeys.GEMINI_API_KEY) {
                    geminiApiKeyInput.value = result.secureAPIKeys.GEMINI_API_KEY;
                }
            }
        });
    }

    function saveSettings() {
        const geminiApiKey = geminiApiKeyInput.value.trim();

        // Get existing settings first
        chrome.storage.local.get(['secureAPIKeys'], function (result) {
            if (chrome.runtime.lastError) {
                showStatus('Error loading existing settings: ' + chrome.runtime.lastError.message, 'error');
                return;
            }

            // Create or update secureAPIKeys object
            const secureAPIKeys = result.secureAPIKeys || {};

            // Update the Gemini API key
            if (geminiApiKey) {
                secureAPIKeys.GEMINI_API_KEY = geminiApiKey;
            }

            // Save to storage
            chrome.storage.local.set({ 'secureAPIKeys': secureAPIKeys }, function () {
                if (chrome.runtime.lastError) {
                    showStatus('Error saving settings: ' + chrome.runtime.lastError.message, 'error');
                } else {
                    console.log('secureAPIKeys saved successfully');
                    
                    // Also save in the dedicated key for the Gemini analyzer
                    if (geminiApiKey) {
                        chrome.storage.local.set({ 'geminiApiKey': geminiApiKey }, function() {
                            if (chrome.runtime.lastError) {
                                console.error('Error saving geminiApiKey:', chrome.runtime.lastError);
                            } else {
                                console.log('geminiApiKey saved successfully');
                            }
                        });
                    }

                    showStatus('Settings saved successfully!', 'success');
                    
                    // Verify that the API key was saved correctly
                    setTimeout(() => {
                        chrome.storage.local.get(['geminiApiKey'], function(result) {
                            if (result && result.geminiApiKey) {
                                console.log('Verification: API key was saved properly, length:', result.geminiApiKey.length);
                            } else {
                                console.warn('Verification failed: API key not found in storage after saving');
                            }
                        });
                    }, 1000);
                }
            });
        });
    }

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
        statusDiv.style.display = 'block';

        // Hide after 3 seconds
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
});
