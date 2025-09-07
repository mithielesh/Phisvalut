// Chat functionality for PhishVault
function initializeChat() {
  // Elements
  const aiAnalysisTabs = document.getElementById('aiAnalysisTabs');
  const analysisTab = document.getElementById('analysisTab');
  const chatTab = document.getElementById('chatTab');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  
  // Store current analysis for context
  let securityAnalysisContext = "";
  
  // Tab switching functionality
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
      });
      
      // Add active class to clicked button
      button.classList.add('active');
      
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      
      // Show selected tab content
      const tabId = button.getAttribute('data-tab');
      document.getElementById(`${tabId}Tab`).classList.remove('hidden');
    });
  });
  
  // Add a message to the chat
  function addChatMessage(message, isUser) {
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${isUser ? 'user-message' : 'ai-message'}`;
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Process chat message and get a response
  async function processChatMessage(message) {
    try {
      // Show user message in chat
      addChatMessage(message, true);
      
      // Create a "thinking" message
      const thinkingElement = document.createElement('div');
      thinkingElement.className = 'chat-message ai-message';
      thinkingElement.textContent = 'Thinking...';
      chatMessages.appendChild(thinkingElement);
      
      // Get response from Gemini
      const geminiAnalyzer = new GeminiAnalyzer();
      await geminiAnalyzer.getApiKey();
      
      const response = await geminiAnalyzer.getChatResponse(message, securityAnalysisContext);
      
      // Remove the thinking message
      chatMessages.removeChild(thinkingElement);
      
      // Add the real response
      addChatMessage(response, false);
      
    } catch (error) {
      console.error('Error processing chat message:', error);
      addChatMessage('Sorry, I encountered an error processing your question.', false);
    }
  }
  
  // Chat send button click
  if (sendChatBtn) {
    sendChatBtn.addEventListener('click', () => {
      const message = chatInput.value.trim();
      if (message) {
        processChatMessage(message);
        chatInput.value = '';
      }
    });
  }
  
  // Chat input enter key press
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const message = chatInput.value.trim();
        if (message) {
          processChatMessage(message);
          chatInput.value = '';
        }
      }
    });
  }
  
  // Public methods
  return {
    // Set the security analysis context for the chat
    setAnalysisContext: function(analysisData) {
      securityAnalysisContext = `Security Analysis Summary: ${analysisData.summary || ''}\n\n`;
      if (analysisData.details) {
        securityAnalysisContext += `Details: ${analysisData.details}\n\n`;
      }
      if (analysisData.recommendations) {
        securityAnalysisContext += `Recommendations: ${analysisData.recommendations}\n\n`;
      }
      if (analysisData.technical) {
        securityAnalysisContext += `Technical: ${analysisData.technical}\n\n`;
      }
      
      // Add initial message in chat
      addChatMessage("I've analyzed this website's security. Ask me any questions you have about the findings or what it means for you.", false);
    },
    
    // Show the chat interface
    showChatInterface: function(analysisHtml) {
      // Add the analysis HTML to the analysis tab
      if (analysisTab) {
        analysisTab.innerHTML = analysisHtml;
      }
      
      // Show the tabbed container
      if (aiAnalysisTabs) {
        aiAnalysisTabs.classList.remove('hidden');
      }
    }
  };
}

// Initialize and export
window.PhishVaultChat = initializeChat();
