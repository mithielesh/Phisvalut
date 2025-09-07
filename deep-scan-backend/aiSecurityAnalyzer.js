const axios = require('axios');
const fs = require('fs');
const path = require('path');

// AI Security Analysis Module
class AISecurityAnalyzer {
    constructor(config = {}) {
        this.config = {
            aiProvider: config.aiProvider || 'openai', // 'openai', 'anthropic', etc.
            apiKey: config.apiKey || process.env.OPENAI_API_KEY,
            modelName: config.modelName || 'gpt-4',
            maxTokens: config.maxTokens || 8000,
            temperature: config.temperature || 0.2,
            ...config
        };
        
        this.securityPrompt = `
        As a cybersecurity expert, analyze the following web crawler activity log and provide a comprehensive security assessment.
        Focus on identifying potential security issues, vulnerabilities, and privacy concerns.
        
        Consider these factors in your analysis:
        1. Whether authentication forms use HTTPS
        2. Presence of mixed content (HTTP resources on HTTPS pages)
        3. Security headers and practices
        4. Suspicious patterns in form handling
        5. Potential information leakage
        6. Risky JavaScript practices
        7. Overall site security posture
        
        Structure your analysis as follows:
        1. Executive Summary with an overall security rating (1-10) and key findings
        2. Detailed Findings with specific issues categorized by severity
        3. Recommendations for improving security
        4. Technical Details
        
        Here is the scan data:
        `;
    }
    
    async analyze(scanData) {
        try {
            console.log("Preparing scan data for AI analysis...");
            
            // Prepare data for AI analysis
            const cleanedData = this._prepareDataForAnalysis(scanData);
            
            // Save scan data to file for reference
            this._saveScanDataToFile(cleanedData);
            
            // Get analysis from AI provider
            const analysis = await this._getAnalysisFromAI(cleanedData);
            
            return {
                timestamp: new Date().toISOString(),
                analysis,
                scanSummary: this._generateScanSummary(scanData)
            };
        } catch (error) {
            console.error("AI Analysis Error:", error);
            return {
                timestamp: new Date().toISOString(),
                error: `Error during AI analysis: ${error.message}`,
                scanSummary: this._generateScanSummary(scanData)
            };
        }
    }
    
    _prepareDataForAnalysis(scanData) {
        // Extract relevant information and format it for the AI
        const siteOverview = {
            url: scanData.url,
            title: scanData.title,
            totalPagesScanned: scanData.activityLogs.length,
            totalForms: scanData.forms.length,
            totalLinks: scanData.links.length,
            findings: scanData.findings
        };
        
        // Summarize forms by type
        const formSummary = {};
        scanData.forms.forEach(form => {
            formSummary[form.type] = (formSummary[form.type] || 0) + 1;
        });
        
        // Find security-relevant forms
        const securityForms = scanData.forms.filter(form => 
            form.type === 'login' || 
            form.type === 'registration' ||
            form.hasPasswordField
        );
        
        // Check if any security forms are submitted over HTTP
        const insecureForms = securityForms.filter(form => 
            form.url && form.url.startsWith('http:')
        );
        
        // Compile important security findings
        const securityIssues = scanData.findings.filter(finding => 
            finding.severity === 'high' || finding.severity === 'medium'
        );
        
        return {
            siteOverview,
            formSummary,
            securityForms: securityForms.length,
            insecureForms: insecureForms.length,
            securityIssues,
            totalFindings: scanData.findings.length,
            // Include a sample of the raw data
            activitySample: scanData.activityLogs.slice(0, 5)
        };
    }
    
    async _getAnalysisFromAI(cleanedData) {
        if (this.config.aiProvider === 'openai') {
            return this._getOpenAIAnalysis(cleanedData);
        } else if (this.config.aiProvider === 'anthropic') {
            return this._getAnthropicAnalysis(cleanedData);
        } else if (this.config.aiProvider === 'local') {
            return this._getLocalAnalysis(cleanedData);
        } else {
            throw new Error(`Unsupported AI provider: ${this.config.aiProvider}`);
        }
    }
    
    async _getOpenAIAnalysis(cleanedData) {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: this.config.modelName,
                    messages: [
                        { 
                            role: 'system', 
                            content: 'You are a cybersecurity expert specializing in web application security assessment.' 
                        },
                        { 
                            role: 'user', 
                            content: `${this.securityPrompt}\n${JSON.stringify(cleanedData, null, 2)}` 
                        }
                    ],
                    max_tokens: this.config.maxTokens,
                    temperature: this.config.temperature
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error("OpenAI API Error:", error.response?.data || error.message);
            throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    
    async _getAnthropicAnalysis(cleanedData) {
        try {
            const response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model: this.config.modelName || 'claude-3-opus-20240229',
                    messages: [
                        { 
                            role: 'user', 
                            content: `${this.securityPrompt}\n${JSON.stringify(cleanedData, null, 2)}` 
                        }
                    ],
                    max_tokens: this.config.maxTokens,
                },
                {
                    headers: {
                        'x-api-key': this.config.apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            return response.data.content[0].text;
        } catch (error) {
            console.error("Anthropic API Error:", error.response?.data || error.message);
            throw new Error(`Anthropic API error: ${error.response?.data?.error?.message || error.message}`);
        }
    }
    
    _getLocalAnalysis(cleanedData) {
        // Simple rule-based analysis for when AI API is not available
        const securityScore = this._calculateSecurityScore(cleanedData);
        
        let analysis = `
        # Security Analysis Report
        
        ## Executive Summary
        
        Security Rating: ${securityScore}/10
        
        The site has been analyzed based on the crawler activity logs. `;
        
        if (securityScore < 5) {
            analysis += "Multiple significant security concerns were identified that require immediate attention.";
        } else if (securityScore < 8) {
            analysis += "Some security issues were detected that should be addressed to improve the site's security posture.";
        } else {
            analysis += "The site demonstrates good security practices overall, with only minor improvements suggested.";
        }
        
        // Add detailed findings based on data
        analysis += `
        
        ## Detailed Findings
        
        ### Forms and Authentication
        - Total Forms: ${cleanedData.formSummary.total || 0}
        - Login Forms: ${cleanedData.formSummary.login || 0}
        - Insecure Forms (HTTP): ${cleanedData.insecureForms}
        
        ### Security Issues
        - High Severity: ${cleanedData.securityIssues.filter(i => i.severity === 'high').length}
        - Medium Severity: ${cleanedData.securityIssues.filter(i => i.severity === 'medium').length}
        
        ## Recommendations
        `;
        
        // Add recommendations based on findings
        if (cleanedData.insecureForms > 0) {
            analysis += "\n- Move all authentication and sensitive forms to HTTPS";
        }
        
        if (cleanedData.securityIssues.some(i => i.type === 'missing_csp')) {
            analysis += "\n- Implement Content Security Policy (CSP) headers";
        }
        
        return analysis;
    }
    
    _calculateSecurityScore(data) {
        // Simple scoring algorithm
        let score = 10;
        
        // Deduct for insecure forms
        if (data.insecureForms > 0) {
            score -= data.insecureForms * 2;
        }
        
        // Deduct for security issues
        score -= data.securityIssues.filter(i => i.severity === 'high').length * 1.5;
        score -= data.securityIssues.filter(i => i.severity === 'medium').length * 0.5;
        
        // Ensure score is between 1 and 10
        return Math.max(1, Math.min(10, Math.round(score)));
    }
    
    _generateScanSummary(scanData) {
        return {
            url: scanData.url,
            pagesScanned: scanData.activityLogs.length,
            formsFound: scanData.forms.length,
            linksDiscovered: scanData.links.length,
            securityIssues: scanData.findings.length,
            scanDate: new Date().toISOString()
        };
    }
    
    _saveScanDataToFile(data) {
        try {
            const logsDir = path.join(__dirname, 'ai_analysis_logs');
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            const filename = `scan_data_${new Date().toISOString().replace(/:/g, '-')}.json`;
            fs.writeFileSync(
                path.join(logsDir, filename),
                JSON.stringify(data, null, 2)
            );
            
            console.log(`Scan data saved to ${filename}`);
        } catch (error) {
            console.error("Error saving scan data:", error);
        }
    }
}

module.exports = AISecurityAnalyzer;
