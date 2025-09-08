// Chat functionality for PhishVault
// Chat functionality for PhishVault
document.addEventListener('DOMContentLoaded', function () {
  // Check if we're on the correct page
  if (!document.getElementById('chatMessages')) return;

  // Elements
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');

  // Store current analysis for context
  let securityAnalysisContext = "";

  // Function to get the current security analysis context
  function updateSecurityAnalysisContext() {
    // Get data from the summary tab
    const summaryContent = document.getElementById('summary-content');
    if (summaryContent) {
      securityAnalysisContext = summaryContent.innerText;
    }

    // Add URL information
    const analyzedUrl = document.getElementById('analyzed-url');
    if (analyzedUrl) {
      securityAnalysisContext = `URL: ${analyzedUrl.innerText}\n\n${securityAnalysisContext}`;
    }

    // Add security score
    const securityScore = document.getElementById('security-score');
    const scoreLabel = document.getElementById('score-label');
    if (securityScore && scoreLabel) {
      securityAnalysisContext = `Security Score: ${securityScore.innerText}/10 (${scoreLabel.innerText})\n\n${securityAnalysisContext}`;
    }
  }

  // Add a message to the chat
  function addChatMessage(message, isUser) {
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${isUser ? 'user-message' : 'ai-message'}`;

    // Create message structure
    const messageContentEl = document.createElement('div');
    messageContentEl.className = 'message-content';

    // Create avatar for AI messages
    if (!isUser) {
      const avatarEl = document.createElement('div');
      avatarEl.className = 'message-avatar';

      const iconEl = document.createElement('i');
      iconEl.className = 'fas fa-robot';

      avatarEl.appendChild(iconEl);
      messageElement.appendChild(avatarEl);
    }

    // Format the message content with proper paragraphs
    const paragraphs = message.split('\n\n');
    paragraphs.forEach(paragraph => {
      if (paragraph.trim()) {
        const p = document.createElement('p');
        p.textContent = paragraph;
        messageContentEl.appendChild(p);
      }
    });

    messageElement.appendChild(messageContentEl);

    // Add the message to the chat
    chatMessages.appendChild(messageElement);

    // Scroll to the bottom of the chat
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Process a chat message
  async function processChatMessage(message) {
    try {
      // Before processing a new message, update the security context
      updateSecurityAnalysisContext();

      // Add the user message to the chat
      addChatMessage(message, true);

      // Create a "thinking" message
      const thinkingElement = document.createElement('div');
      thinkingElement.className = 'chat-message ai-message';

      const thinkingAvatar = document.createElement('div');
      thinkingAvatar.className = 'message-avatar';
      const iconEl = document.createElement('i');
      iconEl.className = 'fas fa-robot';
      thinkingAvatar.appendChild(iconEl);

      const thinkingContent = document.createElement('div');
      thinkingContent.className = 'message-content';
      const thinkingText = document.createElement('p');
      thinkingText.textContent = 'Thinking...';
      thinkingContent.appendChild(thinkingText);

      thinkingElement.appendChild(thinkingAvatar);
      thinkingElement.appendChild(thinkingContent);

      chatMessages.appendChild(thinkingElement);

      // Get response from backend AI service
      try {
        const response = await fetch('http://localhost:3000/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            context: securityAnalysisContext
          }),
        });

        // Remove the thinking message
        chatMessages.removeChild(thinkingElement);

        if (response.ok) {
          const data = await response.json();
          addChatMessage(data.response, false);
        } else {
          throw new Error('Failed to get response from AI service');
        }
      } catch (error) {
        // Remove the thinking message if still present
        if (chatMessages.contains(thinkingElement)) {
          chatMessages.removeChild(thinkingElement);
        }

        console.error('Error with AI service:', error);
        addChatMessage('I apologize, but I couldn\'t connect to the AI service. Please check your connection or try again later.', false);
      }

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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent default to avoid newline
        const message = chatInput.value.trim();
        if (message) {
          processChatMessage(message);
          chatInput.value = '';
        }
      }
    });
  }
});
