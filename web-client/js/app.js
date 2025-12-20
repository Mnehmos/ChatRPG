/**
 * ChatRPG Web Client - OpenAI API Integration
 * Uses OpenAI's API with ChatRPG as a remote MCP server
 */

class ChatApp {
    constructor() {
        this.conversationHistory = [];
        this.isProcessing = false;

        // DOM elements
        this.messagesContainer = document.getElementById('messages');
        this.userInput = document.getElementById('user-input');
        this.sendButton = document.getElementById('send-button');
        this.statusIndicator = document.querySelector('.status-indicator');
        this.statusText = document.querySelector('.status-text');

        this.init();
    }

    init() {
        // Check config
        if (!window.CHATRPG_CONFIG || !window.CHATRPG_CONFIG.openaiApiKey) {
            this.showError('Configuration error: OpenAI API key not set');
            this.updateStatus('error', 'Not configured');
            return;
        }

        if (!window.CHATRPG_CONFIG.mcpServerUrl) {
            this.showError('Configuration error: MCP server URL not set');
            this.updateStatus('error', 'Not configured');
            return;
        }

        // Set up event listeners
        this.setupEventListeners();

        // Update status
        this.updateStatus('connected', 'Ready');
        this.sendButton.disabled = false;
    }

    setupEventListeners() {
        // Send button
        this.sendButton.addEventListener('click', () => this.sendMessage());

        // Enter key in textarea (Shift+Enter for new line)
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = Math.min(this.userInput.scrollHeight, 150) + 'px';
        });
    }

    updateStatus(status, text) {
        this.statusIndicator.className = `status-indicator ${status}`;
        this.statusText.textContent = text;
    }

    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message || this.isProcessing) return;

        // Add user message to chat
        this.addMessage('user', message);
        this.conversationHistory.push({
            role: 'user',
            content: message
        });

        // Clear input
        this.userInput.value = '';
        this.userInput.style.height = 'auto';

        // Update state
        this.isProcessing = true;
        this.updateInputState();
        this.updateStatus('connecting', 'Thinking...');

        // Show loading indicator
        const loadingId = this.addLoadingMessage();

        try {
            // Call OpenAI API with ChatRPG as remote MCP server
            const response = await this.callOpenAI(message);

            // Remove loading indicator
            this.removeMessage(loadingId);

            // Add assistant response
            if (response) {
                this.addMessage('assistant', response);
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response
                });
            }

            this.updateStatus('connected', 'Ready');

        } catch (error) {
            console.error('Error calling OpenAI:', error);
            this.removeMessage(loadingId);
            this.showError(`Failed to get response: ${error.message}`);
            this.updateStatus('error', 'Error');
        } finally {
            this.isProcessing = false;
            this.updateInputState();
        }
    }

    async callOpenAI(userMessage) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.CHATRPG_CONFIG.openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful D&D 5e assistant powered by the ChatRPG MCP server. Use the available tools to help users manage characters, run combat encounters, track inventory, and more. When users ask about D&D mechanics, character creation, or campaign management, use the appropriate ChatRPG tools.'
                    },
                    ...this.conversationHistory.slice(-10), // Keep last 10 messages for context
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],
                tools: [
                    {
                        type: 'mcp',
                        server_label: 'chatrpg',
                        server_description: 'A comprehensive D&D 5e MCP server for character management, combat encounters, inventory tracking, spell management, and campaign organization.',
                        server_url: window.CHATRPG_CONFIG.mcpServerUrl,
                        require_approval: 'never'
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
        }

        const data = await response.json();

        // Extract assistant's response
        const assistantMessage = data.choices[0]?.message;

        if (assistantMessage?.tool_calls) {
            // If there were tool calls, the final content should include results
            console.log('Tool calls made:', assistantMessage.tool_calls);
        }

        return assistantMessage?.content || 'No response generated.';
    }

    updateInputState() {
        this.sendButton.disabled = this.isProcessing;
        this.userInput.disabled = this.isProcessing;
    }

    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.dataset.timestamp = Date.now();

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (typeof content === 'string') {
            // Parse markdown-like formatting
            contentDiv.innerHTML = this.formatMessage(content);
        } else {
            contentDiv.textContent = JSON.stringify(content, null, 2);
        }

        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.scrollToBottom();

        return messageDiv.dataset.timestamp;
    }

    addLoadingMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        const timestamp = Date.now();
        messageDiv.dataset.timestamp = timestamp;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';

        messageDiv.appendChild(contentDiv);
        this.messagesContainer.appendChild(messageDiv);

        this.scrollToBottom();

        return timestamp.toString();
    }

    removeMessage(timestamp) {
        const message = this.messagesContainer.querySelector(`[data-timestamp="${timestamp}"]`);
        if (message) {
            message.remove();
        }
    }

    showError(message) {
        this.addMessage('assistant', `❌ Error: ${message}`);
    }

    formatMessage(text) {
        // Simple formatting for code blocks and line breaks
        return text
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
});
