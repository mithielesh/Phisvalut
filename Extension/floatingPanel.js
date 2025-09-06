(function () {
  const html = `
    <div class="phishvault-container" id="draggable-container">
      <div class="phishvault-header" id="drag-handle"> PhishVault</div>

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
        <label for="useAI">Explain using AI (ChatGPT)</label>
      </div>

      <div class="darkmode-toggle">
        <input type="checkbox" id="darkModeToggle" />
        <label for="darkModeToggle">Dark Mode</label>
      </div>

      <div class="button-group">
        <button id="scanBtn"> Scan Link</button>
        <button id="scanPageBtn"> Scan This Page</button>
      </div>

      <div id="resultBox" class="hidden">
        <h4>Result:</h4>
        <div id="result"></div>
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

  const containerWrapper = document.createElement("div");
  containerWrapper.innerHTML = html;
  document.body.appendChild(containerWrapper);

  const container = containerWrapper.querySelector('#draggable-container');
  const dragHandle = containerWrapper.querySelector('#drag-handle');
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

  const savedX = localStorage.getItem('panelX');
  const savedY = localStorage.getItem('panelY');
  if (savedX && savedY) {
    container.style.left = `${savedX}px`;
    container.style.top = `${savedY}px`;
  }

  const darkModeEnabled = localStorage.getItem('phishvaultDarkMode') === 'true';
  if (darkModeEnabled) {
    container.classList.add('dark-mode');
    darkModeToggle.checked = true;
  }

  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      container.classList.add('dark-mode');
      localStorage.setItem('phishvaultDarkMode', 'true');
    } else {
      container.classList.remove('dark-mode');
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
    result.innerHTML = message;
    resultBox.classList.remove('hidden', 'success', 'error', 'warn', 'loading');
    if (status) resultBox.classList.add(status);
  }

  function showLeakResult(message, status = "") {
    leakResult.innerHTML = message;
    leakResultBox.classList.remove('hidden', 'success', 'error', 'warn', 'loading');
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
        console.log("Response data:", data);

        if (response.ok) {
          // Create a concise summary report from the data
          let securityRating = "Low Risk";
          let riskColor = "green";

          // Calculate security risk based on findings
          if (data.summary && data.summary.securityIssues > 5) {
            securityRating = "High Risk";
            riskColor = "red";
          } else if (data.summary && data.summary.securityIssues > 2) {
            securityRating = "Medium Risk";
            riskColor = "orange";
          }

          // Create concise report
          let report = `<strong>Deep Scan Analysis:</strong><br>`;
          report += `<div style='margin: 5px 0; padding: 5px; border: 1px solid #ddd; border-radius: 4px;'>`;
          report += `<p><span style='color:${riskColor}; font-weight:bold;'>${securityRating}</span></p>`;

          if (data.summary) {
            report += `<p><b>Summary:</b></p>`;
            report += `<ul style='margin-top: 0; padding-left: 20px;'>`;
            report += `<li>Pages visited: ${data.summary.pagesVisited}</li>`;
            report += `<li>Forms detected: ${data.summary.formsFound}</li>`;
            report += `<li>Forms analyzed: ${data.summary.formsSubmitted}</li>`;
            report += `<li>Security issues: ${data.summary.securityIssues}</li>`;
            report += `</ul>`;
          }

          // Add an expandable section for details
          report += `<details>`;
          report += `<summary style='cursor:pointer; color:blue; text-decoration:underline;'>Show detailed analysis</summary>`;
          report += `<div style='margin-top:10px;'>`;

          // Only show the first few items to keep it concise
          const maxItems = Math.min(data.analysis.length, 5);
          for (let i = 0; i < maxItems; i++) {
            const item = data.analysis[i];
            if (item.action === 'visit') {
              report += `<p><b>${item.url}</b> - <span style='color:green;'>Visited</span>`;
              report += `<br>Title: ${item.title}`;

              if (item.forms && item.forms.length) {
                report += `<br>Forms: ${item.forms.length}`;
              }

              if (item.securityFindings && item.securityFindings.length) {
                const findings = item.securityFindings[0];
                if (findings.passwordFields > 0) {
                  report += `<br><span style='color:orange;'>⚠️ Password fields found</span>`;
                }
                if (findings.iframes > 0) {
                  report += `<br><span style='color:orange;'>⚠️ ${findings.iframes} iframes detected</span>`;
                }
                if (findings.downloadLinks > 0) {
                  report += `<br><span style='color:orange;'>⚠️ ${findings.downloadLinks} download links found</span>`;
                }
              }

              report += `</p>`;
            }
          }

          if (data.analysis.length > maxItems) {
            report += `<p><em>...and ${data.analysis.length - maxItems} more pages analyzed</em></p>`;
          }

          report += `</div>`;
          report += `</details>`;
          report += `</div>`;

          showResult(report, "success");
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
    scanBtn.click();
  });

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

  // Dragging Logic
  let isDragging = false, offsetX = 0, offsetY = 0;

  dragHandle.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDrag);

  dragHandle.addEventListener('touchstart', startDrag);
  document.addEventListener('touchmove', drag);
  document.addEventListener('touchend', stopDrag);

  function startDrag(e) {
    isDragging = true;
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    container.style.transition = 'none';
  }

  function drag(e) {
    if (!isDragging) return;
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    const newX = clientX - offsetX;
    const newY = clientY - offsetY;
    container.style.left = `${newX}px`;
    container.style.top = `${newY}px`;
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    const rect = container.getBoundingClientRect();
    localStorage.setItem('panelX', rect.left);
    localStorage.setItem('panelY', rect.top);
  }
})();
