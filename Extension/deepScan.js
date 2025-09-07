/**
 * PhishVault Deep Scanner Module
 * Enhanced crawler and security analyzer for thorough website inspection
 */

class DeepScanner {
  constructor(options = {}) {
    this.options = {
      maxDepth: options.maxDepth || 5,
      maxPagesPerDomain: options.maxPagesPerDomain || 50,
      maxConcurrentRequests: options.maxConcurrentRequests || 5,
      followSubdomains: options.followSubdomains || false,
      ignoreQuery: options.ignoreQuery || false,
      timeout: options.timeout || 30000, // 30 seconds
      userAgent: options.userAgent || 'PhishVault Security Scanner',
      ...options
    };

    this.visited = new Set();
    this.queue = [];
    this.findings = [];
    this.domainVisitCount = {};
    this.activeCrawls = 0;
    this.startTime = null;
    this.cookies = {};
    this.sessionData = {};
    this.formInteractionResults = [];
    this.vulnerabilityTests = {};
  }

  async scan(url, callback) {
    try {
      this.startTime = Date.now();
      this.callback = callback;
      this.rootDomain = this._extractDomain(url);
      
      // Reset counters and collections
      this.visited.clear();
      this.queue = [];
      this.findings = [];
      this.domainVisitCount = {};
      this.domainVisitCount[this.rootDomain] = 0;
      
      // Initialize progress tracking
      this.totalPages = 0;
      this.scannedPages = 0;
      
      // Start the scan
      this._log(`Starting enhanced deep scan of ${url}`);
      await this._enqueueUrl(url, 0, "Initial URL");
      await this._processQueue();
      
      // Compile findings
      const scanTime = (Date.now() - this.startTime) / 1000;
      const result = {
        url: url,
        scanTime,
        pagesScanned: this.scannedPages,
        findings: this.findings,
        vulnerabilities: this._compileVulnerabilities(),
        riskScore: this._calculateRiskScore(),
        summary: this._generateSummary()
      };
      
      this._log(`Scan completed in ${scanTime}s. Scanned ${this.scannedPages} pages with ${this.findings.length} findings.`);
      return result;
    } catch (error) {
      this._log(`Deep scan error: ${error.message}`, 'error');
      return {
        url,
        error: true,
        message: error.message,
        findings: this.findings
      };
    }
  }

  async _processQueue() {
    while (this.queue.length > 0) {
      // Process multiple URLs concurrently up to maxConcurrentRequests
      const batch = [];
      while (batch.length < this.options.maxConcurrentRequests && this.queue.length > 0) {
        batch.push(this.queue.shift());
      }
      
      await Promise.all(batch.map(item => this._crawlPage(item.url, item.depth, item.source)));
      
      // Check if we've reached the time limit
      if (this.options.maxScanTime && (Date.now() - this.startTime) / 1000 > this.options.maxScanTime) {
        this._log(`Scan time limit reached (${this.options.maxScanTime}s). Stopping scan.`);
        break;
      }
    }
  }

  async _crawlPage(url, depth, source) {
    if (this.visited.has(url)) return;
    this.visited.add(url);
    
    try {
      this._log(`Crawling page: ${url} (depth ${depth}/${this.options.maxDepth}) | From: ${source}`);
      this.scannedPages++;
      
      const domain = this._extractDomain(url);
      this.domainVisitCount[domain] = (this.domainVisitCount[domain] || 0) + 1;
      
      // Simulate sending a message to background script to fetch the page
      const pageData = await this._fetchPage(url);
      
      // Analyze the page for security issues
      await this._analyzePage(url, pageData);
      
      // Don't continue if we've reached the max depth
      if (depth >= this.options.maxDepth) return;
      
      // Extract and queue links
      const links = this._extractLinks(pageData.content, url);
      await this._queueNewLinks(links, depth + 1, url);
      
      // Process forms
      await this._processForms(pageData.content, url, depth);
      
      // Run security tests
      await this._runSecurityTests(url, pageData);
      
    } catch (error) {
      this._log(`Error crawling ${url}: ${error.message}`, 'error');
      this.findings.push({
        type: 'error',
        url,
        message: `Failed to crawl page: ${error.message}`,
        source
      });
    }
  }
  
  async _fetchPage(url) {
    // This would be replaced with actual fetch logic in the extension
    // Here we simulate a response
    this._log(`Fetching page content for ${url}`);
    
    return {
      url,
      content: "<!-- Simulated page content -->",
      headers: {
        'content-type': 'text/html',
        'server': 'Apache'
      },
      statusCode: 200
    };
  }
  
  async _analyzePage(url, pageData) {
    this._log(`Analyzing security of ${url}`);
    
    // Check for security headers
    await this._checkSecurityHeaders(url, pageData.headers);
    
    // Check for sensitive information exposure
    await this._checkSensitiveInfoExposure(url, pageData.content);
    
    // Check for vulnerable libraries
    await this._checkVulnerableLibraries(url, pageData.content);
    
    // Check for SSL/TLS issues
    await this._checkSSL(url);
    
    // Check for input validation vulnerabilities
    await this._checkInputValidation(url, pageData.content);
  }
  
  async _checkSecurityHeaders(url, headers) {
    // List of important security headers
    const securityHeaders = [
      { name: 'Content-Security-Policy', alias: ['csp'] },
      { name: 'X-Content-Type-Options', value: 'nosniff' },
      { name: 'X-Frame-Options', alias: ['x-frame'] },
      { name: 'X-XSS-Protection', alias: ['x-xss'] },
      { name: 'Strict-Transport-Security', alias: ['hsts'] },
      { name: 'Referrer-Policy' },
      { name: 'Permissions-Policy', alias: ['feature-policy'] }
    ];
    
    // Normalize header keys to lowercase
    const normalizedHeaders = {};
    Object.keys(headers).forEach(key => {
      normalizedHeaders[key.toLowerCase()] = headers[key];
    });
    
    securityHeaders.forEach(header => {
      const headerName = header.name.toLowerCase();
      const aliases = (header.alias || []).map(a => a.toLowerCase());
      
      // Check if the header or any of its aliases exist
      const exists = Object.keys(normalizedHeaders).some(key => 
        key === headerName || aliases.includes(key)
      );
      
      if (!exists) {
        this.findings.push({
          type: 'missing_security_header',
          url,
          header: header.name,
          severity: 'medium',
          description: `Missing ${header.name} header which helps protect against various attacks.`
        });
        
        this.vulnerabilityTests[`missing_${headerName.replace(/-/g, '_')}`] = true;
      } else if (header.value && normalizedHeaders[headerName] !== header.value) {
        this.findings.push({
          type: 'weak_security_header',
          url,
          header: header.name,
          value: normalizedHeaders[headerName],
          expected: header.value,
          severity: 'low',
          description: `${header.name} has a value different from the recommended "${header.value}".`
        });
      }
    });
  }
  
  async _checkSensitiveInfoExposure(url, content) {
    // Check for sensitive information patterns
    const patterns = [
      { pattern: /password\s*=\s*['"][^'"]*['"]/, type: 'hardcoded_password', severity: 'high' },
      { pattern: /api[_\s]*key\s*=\s*['"][^'"]*['"]/, type: 'exposed_api_key', severity: 'high' },
      { pattern: /secret\s*=\s*['"][^'"]*['"]/, type: 'exposed_secret', severity: 'high' },
      { pattern: /token\s*=\s*['"][^'"]*['"]/, type: 'exposed_token', severity: 'high' },
      { pattern: /['"](AIza[0-9A-Za-z-_]{35})['"]/, type: 'google_api_key', severity: 'high' },
      { pattern: /['"](sk_live_[0-9a-zA-Z]{24})['"]/, type: 'stripe_key', severity: 'high' },
      { pattern: /['"](AKIA[0-9A-Z]{16})['"]/, type: 'aws_key', severity: 'high' }
    ];
    
    patterns.forEach(item => {
      if (item.pattern.test(content)) {
        this.findings.push({
          type: 'sensitive_info_exposure',
          url,
          infoType: item.type,
          severity: item.severity,
          description: `Potential ${item.type.replace(/_/g, ' ')} found in page content.`
        });
        
        this.vulnerabilityTests[item.type] = true;
      }
    });
  }
  
  async _checkVulnerableLibraries(url, content) {
    // Check for known vulnerable JS libraries
    const libraryPatterns = [
      { pattern: /jquery[.-]1\.[0-9]+\.[0-9]+/, name: 'jQuery 1.x', severity: 'medium' },
      { pattern: /jquery[.-]2\.[0-4]/, name: 'jQuery < 2.5', severity: 'medium' },
      { pattern: /angular[.-]1\.[0-5]/, name: 'Angular 1.x < 1.6', severity: 'medium' },
      { pattern: /bootstrap[.-]2\./, name: 'Bootstrap 2.x', severity: 'low' },
      { pattern: /react[.-]0\./, name: 'React 0.x', severity: 'medium' }
    ];
    
    libraryPatterns.forEach(lib => {
      if (lib.pattern.test(content)) {
        this.findings.push({
          type: 'vulnerable_library',
          url,
          library: lib.name,
          severity: lib.severity,
          description: `Potentially vulnerable version of ${lib.name} detected.`
        });
        
        this.vulnerabilityTests.outdated_libraries = true;
      }
    });
  }
  
  async _checkSSL(url) {
    if (!url.startsWith('https://')) {
      this.findings.push({
        type: 'no_ssl',
        url,
        severity: 'high',
        description: 'Site is not using HTTPS encryption.'
      });
      
      this.vulnerabilityTests.no_ssl = true;
      return;
    }
    
    // Further SSL checks would be implemented in the actual extension
    // This is just a placeholder
  }
  
  async _checkInputValidation(url, content) {
    // Check for potential XSS vulnerabilities
    const xssVectors = [
      { pattern: /\<input.*value\s*=\s*["'].*\$\{.*\}.*["']/, type: 'xss_potential', severity: 'high' },
      { pattern: /document\.write\s*\(.*\)/, type: 'xss_document_write', severity: 'medium' },
      { pattern: /eval\s*\(/, type: 'xss_eval', severity: 'high' }
    ];
    
    xssVectors.forEach(vector => {
      if (vector.pattern.test(content)) {
        this.findings.push({
          type: 'input_validation',
          url,
          vulnType: vector.type,
          severity: vector.severity,
          description: `Potential ${vector.type.replace(/_/g, ' ')} vulnerability detected.`
        });
        
        this.vulnerabilityTests.xss_vulnerable = true;
      }
    });
  }
  
  async _processForms(content, url, depth) {
    // In actual implementation, this would parse the HTML and extract forms
    // Here we're just logging that we'd process forms
    this._log(`Processing forms on ${url}`);
    
    // Simulated form detection
    const formCount = 2; // Simulated value
    this._log(`Found ${formCount} forms on the page`);
    
    // In actual implementation, we would test each form for CSRF, XSS, etc.
  }
  
  _extractLinks(content, baseUrl) {
    // In actual implementation, this would parse HTML and extract links
    // Here we simulate returning some links
    return [
      baseUrl + '/about',
      baseUrl + '/contact',
      baseUrl + '/products'
    ];
  }
  
  async _queueNewLinks(links, depth, source) {
    for (const url of links) {
      await this._enqueueUrl(url, depth, source);
    }
  }
  
  async _enqueueUrl(url, depth, source) {
    // Normalize the URL
    const normalizedUrl = this._normalizeUrl(url);
    if (!normalizedUrl) return;
    
    // Skip if already visited or queued
    if (this.visited.has(normalizedUrl)) return;
    
    const domain = this._extractDomain(normalizedUrl);
    
    // Skip if not following subdomains and it's a different subdomain
    if (!this.options.followSubdomains && !this._isSameDomain(domain, this.rootDomain)) return;
    
    // Skip if we've reached the maximum pages for this domain
    if (this.domainVisitCount[domain] >= this.options.maxPagesPerDomain) return;
    
    this.queue.push({ url: normalizedUrl, depth, source });
    this.totalPages++;
  }
  
  _normalizeUrl(url) {
    try {
      // Handle relative URLs
      if (url.startsWith('/') || !url.includes('://')) {
        const base = new URL(url.startsWith('/') ? this.rootDomain : url);
        url = new URL(url, base).href;
      }
      
      const parsed = new URL(url);
      
      // Skip non-http(s) URLs
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      
      // Skip common non-content URLs
      if (/\.(jpg|jpeg|png|gif|svg|css|js|ico|woff|ttf|eot)(\?.*)?$/.test(parsed.pathname)) return null;
      
      // Remove query parameters if configured
      if (this.options.ignoreQuery) {
        parsed.search = '';
      }
      
      return parsed.toString();
    } catch (e) {
      return null;
    }
  }
  
  _extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch (e) {
      return null;
    }
  }
  
  _isSameDomain(domain1, domain2) {
    // Check if domain1 is the same as domain2 or a subdomain of domain2
    return domain1 === domain2 || domain1.endsWith('.' + domain2);
  }
  
  _compileVulnerabilities() {
    return {
      missingSecurityHeaders: Object.keys(this.vulnerabilityTests)
        .filter(key => key.startsWith('missing_') && this.vulnerabilityTests[key])
        .map(key => key.replace('missing_', '')),
      sensitiveInfoExposure: this.vulnerabilityTests.hardcoded_password || 
                             this.vulnerabilityTests.exposed_api_key ||
                             this.vulnerabilityTests.exposed_token,
      xssVulnerable: this.vulnerabilityTests.xss_vulnerable,
      outdatedLibraries: this.vulnerabilityTests.outdated_libraries,
      noSSL: this.vulnerabilityTests.no_ssl
    };
  }
  
  _calculateRiskScore() {
    // Calculate a risk score based on findings
    let score = 100; // Start with perfect score
    
    // Reduce score based on findings
    this.findings.forEach(finding => {
      switch (finding.severity) {
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 7;
          break;
        case 'low':
          score -= 3;
          break;
        default:
          score -= 1;
      }
    });
    
    // Ensure score is within bounds
    return Math.max(0, Math.min(100, score));
  }
  
  _generateSummary() {
    // Generate a summary of the scan findings
    const highSeverity = this.findings.filter(f => f.severity === 'high').length;
    const mediumSeverity = this.findings.filter(f => f.severity === 'medium').length;
    const lowSeverity = this.findings.filter(f => f.severity === 'low').length;
    
    let riskLevel = 'low';
    if (highSeverity > 0) {
      riskLevel = 'high';
    } else if (mediumSeverity > 2) {
      riskLevel = 'medium';
    }
    
    return {
      riskLevel,
      highSeverityCount: highSeverity,
      mediumSeverityCount: mediumSeverity,
      lowSeverityCount: lowSeverity,
      totalFindings: this.findings.length,
      pagesScanned: this.scannedPages
    };
  }
  
  _log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    
    // If we have a callback, call it with the log message
    if (this.callback && level !== 'debug') {
      this.callback({
        type: 'log',
        level,
        message,
        timestamp
      });
    }
  }
}

// Export the DeepScanner class for use in the extension
window.PhishVaultDeepScanner = DeepScanner;
