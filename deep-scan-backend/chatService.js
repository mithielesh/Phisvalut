// AI Chat Service for PhishVault
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Get API key from environment or config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "your-api-key-here";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function setupChatService(app) {
  // Enable CORS
  app.use(cors({
    origin: ['chrome-extension://*', 'http://localhost:*'],
    methods: ['GET', 'POST']
  }));
  
  // Middleware to parse JSON
  app.use(express.json());
  
  // Chat endpoint
  app.post('/chat', async (req, res) => {
    try {
      const { message, context } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }
      
      // Generate response using Gemini
      const response = await generateChatResponse(message, context);
      
      res.json({
        success: true,
        response
      });
    } catch (error) {
      console.error('Chat API error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate chat response'
      });
    }
  });
  
  console.log('Chat service initialized');
}

async function generateChatResponse(message, context) {
  try {
    // Initialize Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // Create a chat session
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: "I'm analyzing a website for phishing and security issues. Here's what I found: " + context }],
        },
        {
          role: "model",
          parts: [{ text: "I'll help you understand these security findings and answer any questions about this website's security and potential phishing threats." }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });
    
    // Send message and get response
    const result = await chat.sendMessage(message);
    const response = result.response.text();
    
    return response;
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('Failed to generate AI response: ' + error.message);
  }
}

module.exports = {
  setupChatService
};
