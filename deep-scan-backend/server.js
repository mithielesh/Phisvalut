// PhishVault Backend Server
const express = require('express');
const cors = require('cors');
const { setupChatService } = require('./chatService');
const { AISecurityAnalyzer } = require('./aiSecurityAnalyzer');
const { runSeleniumCrawler } = require('./selenium_service');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors({
  origin: ['chrome-extension://*', 'http://localhost:*'],
  methods: ['GET', 'POST']
}));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize the AI Security Analyzer
const securityAnalyzer = new AISecurityAnalyzer();

// Set up routes
app.get('/', (req, res) => {
  res.send('PhishVault Security Scanner API is running');
});

// Analyze URL for security issues
app.post('/analyze-security', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }
    
    console.log(`Analyzing security for URL: ${url}`);
    
    // Run the crawler
    const scanResults = await runSeleniumCrawler(url);
    
    // Analyze the results with AI
    const securityAnalysis = await securityAnalyzer.analyze(scanResults);
    
    res.json({
      success: true,
      url,
      scanResults,
      securityAnalysis
    });
  } catch (error) {
    console.error('Security analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze security'
    });
  }
});

// Set up the chat service
setupChatService(app);

// Start server
app.listen(PORT, () => {
  console.log(`PhishVault backend server running on port ${PORT}`);
});
