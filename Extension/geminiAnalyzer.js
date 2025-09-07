// Gemini AI Security Analysis integration for PhishVault
// This handles communication with Google's Gemini API for security analysis

class GeminiAnalyzer {
    constructor(apiKey = null) {
        this.apiKey = apiKey || null;
        this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
        this.ready = !!this.apiKey;
    }

    async setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.ready = !!this.apiKey;
        return this.ready;
    }

    async getApiKey() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['geminiApiKey'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (result && result.geminiApiKey) {
                    this.apiKey = result.geminiApiKey;
                    this.ready = true;
                    resolve(this.apiKey);
                } else {
                    reject(new Error('No API key found in storage'));
                }
            });
        });
    }

    async analyzeSecurity(scanData) {
        try {
            if (!this.ready && !this.apiKey) {
                await this.getApiKey().catch(() => {
                    throw new Error('Gemini API key not configured');
                });
            }

            const prompt = this._preparePrompt(scanData);
            const response = await this._callGeminiApi(prompt);
            return this._parseResponse(response);
        } catch (error) {
            console.error('Gemini analysis error:', error);
            return {
                error: true,
                message: `AI analysis failed: ${error.message}`,
                summary: 'Unable to generate AI-powered analysis'
            };
        }
    }

    _preparePrompt(scanData) {
        // Create a focused prompt for security analysis
        return {
            contents: [{
                parts: [{
                    text: `You are a cybersecurity expert analyzing web security. Please analyze this scan data and provide a detailed security assessment.
          
Focus on identifying:
1. Security vulnerabilities and risks
2. Potential phishing indicators
3. Data protection issues
4. Overall security rating (scale of 1-10)

Format your response with these sections:
- "SUMMARY": Brief overview of the security analysis with risk rating (low/medium/high)
- "DETAILS": Detailed explanation of specific security issues found
- "RECOMMENDATIONS": Actionable steps to improve security
- "TECHNICAL": Technical explanation of vulnerabilities

Here is the scan data to analyze:
${JSON.stringify(scanData, null, 2)}
`
                }]
            }]
        };
    }

    async _callGeminiApi(prompt) {
        const url = `${this.endpoint}?key=${this.apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(prompt)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Gemini API call failed:', error);
            throw error;
        }
    }

    _parseResponse(response) {
        try {
            // Extract the text from Gemini API response
            const text = response.candidates[0].content.parts[0].text;

            // Parse sections
            const sections = {
                summary: this._extractSection(text, 'SUMMARY'),
                details: this._extractSection(text, 'DETAILS'),
                recommendations: this._extractSection(text, 'RECOMMENDATIONS'),
                technical: this._extractSection(text, 'TECHNICAL')
            };

            // Extract risk level from summary
            const riskMatch = sections.summary.match(/risk(?:\s+rating)?(?:\s+is)?(?:\s*:)?\s*(low|medium|high)/i);
            const riskLevel = riskMatch ? riskMatch[1].toLowerCase() : 'unknown';

            // Extract score from summary if available
            const scoreMatch = sections.summary.match(/(\d+)(?:\s*\/\s*|\s+out\s+of\s+)10/i);
            const score = scoreMatch ? parseInt(scoreMatch[1]) : null;

            return {
                summary: sections.summary,
                details: sections.details,
                recommendations: sections.recommendations,
                technical: sections.technical,
                riskLevel: riskLevel,
                score: score,
                fullText: text
            };
        } catch (error) {
            console.error('Error parsing Gemini response:', error);
            return {
                error: true,
                message: 'Failed to parse AI analysis',
                summary: 'The AI generated a response, but it could not be properly processed.'
            };
        }
    }

    _extractSection(text, sectionName) {
        const regex = new RegExp(`${sectionName}:?\\s*([\\s\\S]*?)(?=(?:SUMMARY|DETAILS|RECOMMENDATIONS|TECHNICAL):?|$)`, 'i');
        const match = text.match(regex);
        return match ? match[1].trim() : '';
    }
}

// Export the analyzer
window.GeminiAnalyzer = GeminiAnalyzer;
