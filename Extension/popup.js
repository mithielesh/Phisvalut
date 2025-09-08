// PhishVault Popup Controller

document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const urlInput = document.getElementById('urlInput');
    const scanModeSelect = document.getElementById('scanMode');
    const useAICheckbox = document.getElementById('useAI');
    const scanButton = document.getElementById('scanBtn');
    const resultBox = document.getElementById('resultBox');
    const resultDiv = document.getElementById('result');

    // Load saved preferences
    chrome.storage.local.get(['lastUrl', 'scanMode', 'useAI'], function (data) {
        if (data.lastUrl) urlInput.value = data.lastUrl;
        if (data.scanMode) scanModeSelect.value = data.scanMode;
        if (data.useAI !== undefined) useAICheckbox.checked = data.useAI;
    });

    // Scan button click handler
    scanButton.addEventListener('click', function () {
        const url = urlInput.value.trim();
        const scanMode = scanModeSelect.value;
        const useAI = useAICheckbox.checked;

        if (!url) {
            showResult('Please enter a URL', 'error');
            return;
        }

        // Save preferences
        chrome.storage.local.set({
            lastUrl: url,
            scanMode: scanMode,
            useAI: useAI
        });

        // Show loading
        showResult('Scanning...', 'loading');

        // Forward the request to the background script
        chrome.runtime.sendMessage({
            action: 'scanUrl',
            url: url,
            scanMode: scanMode,
            useAI: useAI
        }, function (response) {
            if (chrome.runtime.lastError) {
                showResult('Error: ' + chrome.runtime.lastError.message, 'error');
                return;
            }

            if (response && response.success) {
                // If deep scan, open the analysis page
                if (scanMode === 'deep') {
                    chrome.runtime.sendMessage({ action: 'openAnalysisPage' });
                } else {
                    showResult(response.message || 'Scan complete', 'success');
                }
            } else {
                showResult(response?.error || 'Unknown error', 'error');
            }
        });
    });

    // Handle Enter key in URL input
    urlInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            scanButton.click();
        }
    });

    // Show result with appropriate styling
    function showResult(message, type = 'info') {
        resultDiv.innerHTML = message;
        resultBox.className = type + ' result-box';
        resultBox.style.display = 'block';
    }

    // Open advanced analysis page
    document.getElementById('openAnalysisBtn')?.addEventListener('click', function () {
        chrome.runtime.sendMessage({ action: 'openAnalysisPage' });
    });
});
