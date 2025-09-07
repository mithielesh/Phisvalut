# PhishVault Security Analyzer

PhishVault is a Chrome extension for detecting and analyzing potential phishing threats and security vulnerabilities in websites.

## Components

1. **Chrome Extension**: Frontend interface that provides scanning and analysis features
2. **Backend Service**: Node.js server that performs deep scanning and AI-powered analysis

## Technology Used

- JavaScript
- Chrome Extension APIs
- Node.js with Express
- Selenium WebDriver for browser automation
- AI-powered security analysis with Google's Gemini API
- LocalStorage for saving user preferences and scan history

## Features

### Security Analysis
- **Intelligent Form Detection**: Automatically identifies different form types including login forms
- **Smart Field Analysis**: Determines field purpose based on multiple attributes (name, id, placeholder, etc.)
- **Security Headers Check**: Analyzes headers for security best practices
- **SSL/TLS Verification**: Checks for proper secure connections

### NEW: Side Navigation & AI Chat Interface
- **Side Navigation Bar**: Easy access to different sections of the extension
- **AI Chat Assistant**: Dedicated AI chat interface for asking questions about security findings
- **Security Explanations**: Get detailed explanations of technical security issues in plain language
- **Custom Recommendations**: Receive personalized security advice based on scan results
- **Context-Aware Form Filling**: Provides appropriate test data based on detected field purpose
- **Multi-Page Navigation**: Follows links to explore site structure more thoroughly
- **Interactive Element Testing**: Clicks buttons and interactions to reveal hidden content

### Enhanced Security Analysis  
- **Security Rating System**: Provides an overall risk score based on findings
- **Detailed Form Analysis**: Shows which forms were submitted successfully and field details
- **Login Form Special Handling**: Detects and properly handles authentication forms
- **Security Headers Check**: Analyzes HTTP headers for security best practices
- **Vulnerability Categorization**: Groups findings by severity level (high/medium/low)

### Improved User Experience
- **Organized Results Display**: Categorizes findings for easier review
- **Collapsible Sections**: Use details/summary elements for cleaner presentation
- **Copy Report Button**: Easily share or save scan results
- **Form Submission Status**: Shows which forms were successfully submitted
- **Link Categorization**: Groups links by domain for better organizationess
2. **Node.js Server**: Backend that performs automated browsing using Selenium WebDriver

## Setup Instructions

### Prerequisites
- Node.js (v14+)
- Chrome browser
- Chrome WebDriver (automatically installed with the dependencies)

### Backend Setup
1. Navigate to the `deep-scan-backend` directory:
   ```
   cd deep-scan-backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the server:
   ```
   node enhanced_server.js
   ```
   Or simply run the included batch file:
   ```
   start-enhanced-server.bat
   ```
   
   The server should display: "Enhanced Deep Scan backend running on port 3000"

### Extension Setup
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Create a `config.js` file in the `Extension` directory:
   - Copy `config.sample.js` to `config.js`
   - Add your actual API keys to the new file
   - **Important**: Never commit this file to the repository
4. Click "Load unpacked" and select the `Extension` directory
5. The PhishVault extension should now be available in your browser

### API Keys Setup
For AI-powered analysis features, you'll need to obtain and configure API keys:

1. **Google Gemini API**:
   - Go to the [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create an API key for the Gemini model
   - Add the key to your `config.js` file

Example config.js:
```javascript
const CONFIG = {
  API_KEYS: {
    GOOGLE_API_KEY: 'your-actual-api-key-here'
  }
};
```

## Usage

1. Visit any website
2. Click on the PhishVault extension icon
3. Select "Deep Scan" from the dropdown
4. Click "Scan This Page"
5. The extension will send the current URL to the backend
6. A Chrome browser will open and automatically analyze the page
7. After the analysis is complete, results will appear in the extension panel

### Scan Types and Their Functions

#### Quick Scan
- Instantly checks URL against known phishing databases
- Verifies SSL certificate validity and status
- Examines domain registration information
- Performs basic security header checks
- Completes in 1-2 seconds

#### Deep Scan
- Launches automated browser session
- Simulates human-like interactions with page elements
- Analyzes forms, links, and interactive elements
- Detects potential credential harvesting attempts
- Identifies suspicious JavaScript behavior
- Examines network requests made by the page
- Takes approximately 15-30 seconds depending on page complexity

## Troubleshooting

- If the scan doesn't work, make sure the backend server is running
- Check browser console for any error messages (right-click extension popup > Inspect)
- Ensure you have the correct host permissions in manifest.json
- Verify that Chrome WebDriver is correctly installed

## Project Structure

### Extension Directory
```
Extension/
├── background.js         # Service worker for browser events and background tasks
├── content-script.js     # Executes in the context of web pages to gather data
├── floatingPanel.css     # Styling for the floating results panel
├── floatingPanel.html    # HTML structure of the floating results panel
├── floatingPanel.js      # Logic for the floating panel UI and interaction
├── manifest.json         # Extension configuration and permissions
├── popup.html            # Main extension popup interface
├── popup.js              # Core extension logic and user interaction
└── style.css             # General styling for extension components
```

### Backend Directory
```
deep-scan-backend/
├── node_modules/            # Node.js dependencies 
├── package.json             # Project dependencies and scripts
├── package-lock.json        # Locked dependency versions
├── enhanced_server.js       # Main server with comprehensive crawler capabilities
├── start-enhanced-server.bat # Batch file to start the server
├── chromedriver.exe         # Chrome WebDriver executable
└── utils/                   # Helper utilities
    ├── elementHelpers.js    # Functions for element interaction
    └── securityChecks.js # Security vulnerability detection algorithms
```

### Other Files
```
PhishVault/
├── README.md             # Project documentation
└── start-server.bat      # Windows batch file to start the backend server
```

### File Descriptions

#### Extension Files
- **background.js**: Handles extension lifecycle events, maintains state, and coordinates communication with the backend server. It runs persistently in the background.
- **content-script.js**: Injected into web pages to gather data that isn't accessible via the Chrome API. It can access the DOM of visited pages.
- **floatingPanel.html/js/css**: Creates and manages the floating panel that appears over web pages to display scan results, with expandable sections for detailed findings.
- **manifest.json**: Defines the extension's permissions, resources, and behavior in Chrome.
- **popup.html/js**: The UI that appears when clicking the extension icon, containing the scan controls and basic information.

#### Backend Files
- **enhanced_server.js**: Main Express server with comprehensive web crawling capabilities, intelligent form detection, and better security analysis.
- **package.json**: Lists the Node.js dependencies including Express, Selenium WebDriver, and utility libraries.
- **start-enhanced-server.bat**: Windows batch file to easily start the server.
- **chromedriver.exe**: Binary executable that allows Selenium to control Chrome.
- **utils/elementHelpers.js**: Functions that help with finding, interacting with, and analyzing webpage elements during the automated scan.
- **utils/securityChecks.js**: Contains algorithms for analyzing potential security issues in web pages.

## Server-Extension Communication

The PhishVault extension and backend server use a well-defined API for communication. Here's a detailed breakdown of how they interact:

### Communication Flow

```
+---------------+                              +------------------+                          +------------------+
|               |  1. Request Scan             |                  |  2. Launch Browser       |                  |
|  Chrome       |----------------------------->|  Node.js         |------------------------->|  Selenium        |
|  Extension    |  {url, scanType, options}    |  Express Server  |                         |  WebDriver       |
|               |                              |                  |                         |                  |
|               |  4. Display Results          |                  |  3. Return Findings      |                  |
|               |<-----------------------------|                  |<------------------------|                  |
+---------------+  {score, issues, details}    +------------------+                          +------------------+
```

### API Endpoints

#### 1. `/api/scan`
- **Method**: POST
- **Request Body**:
  ```json
  {
    "url": "https://example.com",
    "scanType": "deep",
    "options": {
      "followRedirects": true,
      "interactionDepth": 2,
      "timeout": 30000
    }
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "scanId": "abc123",
    "message": "Scan initiated"
  }
  ```

#### 2. `/api/scan/:scanId`
- **Method**: GET
- **Response** (when scan is complete):
  ```json
  {
    "status": "complete",
    "results": {
      "riskScore": 85,
      "issues": [
        {
          "severity": "high",
          "category": "authentication",
          "description": "Password form submits to non-HTTPS endpoint",
          "details": "..."
        },
        // Additional issues...
      ],
      "elementsSummary": {
        "forms": 3,
        "inputFields": 12,
        "buttons": 8,
        "links": 45
      },
      "screenshotBase64": "data:image/png;base64,..."
    }
  }
  ```

### Process Details

1. **Scan Initiation**:
   - The extension captures the current tab's URL
   - User selects scan type and options
   - Extension sends POST request to backend server
   - Server returns a scan ID for status tracking

2. **Backend Processing**:
   - Server launches Chrome via Selenium WebDriver
   - Browser navigates to the specified URL
   - Human-like interactions are performed:
     - Random delays between actions (200-800ms)
     - Natural cursor movements
     - Form field detection and filling
     - Button and link clicking
     - Navigation through page structure

3. **Data Collection**:
   - Server collects DOM information
   - Analyzes form submission endpoints
   - Checks for security headers
   - Examines JavaScript for suspicious patterns
   - Records redirects and domain changes
   - Captures screenshots of suspicious elements

4. **Results Processing**:
   - Server analyzes collected data
   - Calculates risk score based on findings
   - Categorizes issues by severity
   - Generates detailed report
   - Prepares concise summary for extension display

5. **Result Delivery**:
   - Extension polls for results using scan ID
   - When complete, server returns full analysis
   - Extension renders results in floating panel
   - Expandable sections allow detailed inspection

### Error Handling

- Network connectivity issues trigger automatic retries
- Timeouts are handled with partial results when available
- Server overload protection with request queuing
- Extension displays appropriate error messages to the user

### Security Measures

- All communication is restricted to localhost (127.0.0.1)
- No user credentials are ever transmitted to the backend
- Automation runs in an isolated browser instance
- Extension requests require proper origin headers
- Response validation prevents script injection

## Technology Used

- JavaScript
- Chrome Extension APIs
- Node.js with Express
- Selenium WebDriver for browser automation
- WebSocket for real-time scan progress updates
- LocalStorage for saving user preferences and scan history
