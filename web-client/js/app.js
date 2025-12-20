/**
 * ChatRPG Web Client - Main Application
 */

class ChatApp {
    constructor() {
        this.client = null;
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
        if (!window.CHATRPG_CONFIG || !window.CHATRPG_CONFIG.serverUrl) {
            this.showError('Configuration error: Server URL not set');
            return;
        }

        // Initialize MCP client
        this.client = new MCPClient(
            window.CHATRPG_CONFIG.serverUrl,
            window.CHATRPG_CONFIG.apiKey
        );

        // Set up event listeners
        this.setupEventListeners();

        // Connect to server
        this.connect();
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

        // MCP client events
        this.client.on('connection', (data) => this.handleConnectionStatus(data));
        this.client.on('message', (data) => this.handleMessage(data));
        this.client.on('tool_response', (data) => this.handleToolResponse(data));
        this.client.on('error', (data) => this.handleError(data));
    }

    async connect() {
        try {
            this.updateStatus('connecting', 'Connecting...');
            await this.client.connect();
        } catch (error) {
            console.error('Connection failed:', error);
            this.updateStatus('error', 'Connection failed');
            this.showError('Failed to connect to ChatRPG server. Please check your internet connection.');
        }
    }

    handleConnectionStatus(data) {
        switch (data.status) {
            case 'connected':
                this.updateStatus('connected', 'Connected');
                this.sendButton.disabled = false;
                break;
            case 'reconnecting':
                this.updateStatus('connecting', `Reconnecting... (${data.attempt})`);
                this.sendButton.disabled = true;
                break;
            case 'error':
            case 'failed':
                this.updateStatus('error', 'Disconnected');
                this.sendButton.disabled = true;
                break;
            case 'disconnected':
                this.updateStatus('error', 'Disconnected');
                this.sendButton.disabled = true;
                break;
        }
    }

    updateStatus(status, text) {
        this.statusIndicator.className = `status-indicator ${status}`;
        this.statusText.textContent = text;
    }

    handleMessage(data) {
        console.log('Received message:', data);
        // Handle general messages from the server
    }

    handleToolResponse(data) {
        console.log('Received tool response:', data);
        if (data.content) {
            this.addMessage('assistant', this.formatToolResponse(data.content));
        }
        this.isProcessing = false;
        this.updateInputState();
    }

    handleError(data) {
        console.error('Received error:', data);
        this.showError(data.message || 'An error occurred');
        this.isProcessing = false;
        this.updateInputState();
    }

    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message || this.isProcessing) return;

        // Add user message to chat
        this.addMessage('user', message);

        // Clear input
        this.userInput.value = '';
        this.userInput.style.height = 'auto';

        // Update state
        this.isProcessing = true;
        this.updateInputState();

        // Show loading indicator
        const loadingId = this.addLoadingMessage();

        try {
            // Call the MCP server
            const response = await this.client.callTool('chat_message', {
                message: message,
                context: 'web-client'
            });

            // Remove loading indicator
            this.removeMessage(loadingId);

            // Handle response
            if (response.content) {
                this.addMessage('assistant', this.formatToolResponse(response.content));
            } else if (response.error) {
                this.showError(response.error);
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.removeMessage(loadingId);
            this.showError('Failed to send message. Please try again.');
        } finally {
            this.isProcessing = false;
            this.updateInputState();
        }
    }

    updateInputState() {
        this.sendButton.disabled = this.isProcessing || !this.client.isConnected();
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
            .replace(/\n/g, '<br>');
    }

    formatToolResponse(content) {
        if (Array.isArray(content)) {
            // Handle array of content blocks
            return content.map(block => {
                if (block.type === 'text') {
                    return block.text;
                }
                return JSON.stringify(block);
            }).join('\n\n');
        } else if (typeof content === 'object' && content.text) {
            return content.text;
        } else if (typeof content === 'string') {
            return content;
        }
        return JSON.stringify(content, null, 2);
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
