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
            // Add assistant response
            if (response) {
                if (Array.isArray(response)) {
                    // Handle list of response items (tools + text)
                    response.forEach(item => {
                        this.addMessage(item.role || 'assistant', item.content);
                        
                        // Only add text responses to history context to avoid confusing the LLM
                        if (item.type === 'text') {
                            this.conversationHistory.push({
                                role: 'assistant',
                                content: item.content
                            });
                        }
                    });
                } else {
                    // Fallback for single string response
                    this.addMessage('assistant', response);
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: response
                    });
                }
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
        // System prompt - placed first to maximize cache hits
        const systemPrompt = `You are a helpful D&D 5e assistant powered by the ChatRPG MCP server.

Your capabilities include:
- Character creation and management
- Combat encounter tracking
- Inventory management
- Spell management
- Campaign organization
- Dice rolling and D&D 5e rules assistance

Always use the ChatRPG tools when users ask about D&D mechanics, character creation, combat, or campaign management.`;

        // Build conversation context (recent history for continuity)
        const conversationContext = this.conversationHistory
            .slice(-5) // Keep last 5 exchanges for context
            .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
            .join('\n');

        // Structure: Static system prompt first, then conversation history, then current message
        const fullInput = conversationContext
            ? `${systemPrompt}\n\n${conversationContext}\nUser: ${userMessage}`
            : `${systemPrompt}\n\nUser: ${userMessage}`;

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.CHATRPG_CONFIG.openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-5-nano-2025-08-07',
                input: fullInput,
                // Note: In-memory caching is automatic; extended caching (24h) not supported on gpt-5-nano
                tools: [
                    {
                        type: 'mcp',
                        server_label: 'chatrpg',
                        server_description: 'A comprehensive D&D 5e MCP server for character management, combat encounters, inventory tracking, spell management, and campaign organization.',
                        server_url: window.CHATRPG_CONFIG.mcpServerUrl,
                        require_approval: 'never'
                    }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
        }

        const data = await response.json();

        // DEBUG: Log full response to understand structure
        console.log('🔍 Full API Response:', data);

        // Log cache performance metrics
        if (data.usage) {
            const promptDetails = data.usage.prompt_tokens_details || {};
            const cachedTokens = promptDetails.cached_tokens || 0;
            const totalPromptTokens = data.usage.prompt_tokens || 0;
            const cacheHitRate = totalPromptTokens > 0
                ? ((cachedTokens / totalPromptTokens) * 100).toFixed(1)
                : 0;

            console.log('📊 Cache Performance:', {
                cached_tokens: cachedTokens,
                total_prompt_tokens: totalPromptTokens,
                cache_hit_rate: `${cacheHitRate}%`,
                completion_tokens: data.usage.completion_tokens
            });
        }

        // Extended Debugging
        if (Array.isArray(data.output)) {
            // Log types for verification but keep it clean
            const types = data.output.map(item => item.type);
            console.log('📦 Output Array Types:', types);
        }

        // Extract content (Tool Calls & Text)
        const responseItems = [];

        if (Array.isArray(data.output)) {
            // 1. Extract Tool Calls
            data.output.filter(item => item.type === 'mcp_call').forEach(item => {
                // OpenAI MCP uses: name (tool name), arguments (JSON string), output (result string)
                const toolName = item.name || item.tool_name || item.tool_call?.function?.name || 'unknown_tool';
                const status = item.status || 'unknown';
                const icon = status === 'completed' ? '✅' : (status === 'failed' ? '❌' : '🛠️');

                // DEBUG: Log full item structure
                console.log(`🔧 MCP Call [${toolName}]:`, JSON.stringify(item, null, 2));

                let content = `**${icon} Tool:** \`${toolName}\` (${status})`;

                // 1. Inputs (Arguments) - OpenAI sends as JSON string in "arguments"
                const rawArgs = item.arguments || item.args || item.input;

                if (rawArgs) {
                    let argsFormatted;
                    if (typeof rawArgs === 'string') {
                        try {
                            argsFormatted = JSON.stringify(JSON.parse(rawArgs), null, 2);
                        } catch {
                            argsFormatted = rawArgs;
                        }
                    } else {
                        argsFormatted = JSON.stringify(rawArgs, null, 2);
                    }
                    content += `
<details>
  <summary>📥 Inputs</summary>
  <pre><code class="language-json">${argsFormatted}</code></pre>
</details>`;
                }

                // 2. Results / Errors
                if (item.error) {
                    const errStr = typeof item.error === 'string' ? item.error : JSON.stringify(item.error, null, 2);
                    content += `
<details open>
  <summary style="color: var(--error-color)">❌ Error</summary>
  <pre><code class="language-text">${errStr}</code></pre>
</details>`;
                }

                // 3. Output - OpenAI MCP uses "output" property (string or object)
                const rawOutput = item.output || item.result;

                if (rawOutput) {
                    let outputText = '';

                    if (typeof rawOutput === 'string') {
                        // Try to parse and pretty-print if JSON
                        try {
                            const parsed = JSON.parse(rawOutput);
                            outputText = JSON.stringify(parsed, null, 2);
                        } catch {
                            outputText = rawOutput;
                        }
                    } else if (rawOutput.content && Array.isArray(rawOutput.content)) {
                        // MCP content array format
                        outputText = rawOutput.content
                            .filter(c => c.type === 'text')
                            .map(c => c.text)
                            .join('\n');
                    } else {
                        outputText = JSON.stringify(rawOutput, null, 2);
                    }

                    content += `
<details>
  <summary>📤 Output</summary>
  <pre><code class="language-json">${outputText}</code></pre>
</details>`;
                }
                
                responseItems.push({
                    type: 'tool',
                    role: 'system', // Use system role for lighter styling
                    content: content
                });
            });

            // 2. Extract Message Text
            let responseText = null;
            const messageItem = data.output.find(item => item.type === 'message' || item.role === 'assistant');
            
            if (messageItem) {
                 if (typeof messageItem.content === 'string') {
                    responseText = messageItem.content;
                } else if (Array.isArray(messageItem.content)) {
                    responseText = messageItem.content
                        .filter(part => part.type === 'text' || part.type === 'output_text' || typeof part === 'string')
                        .map(part => typeof part === 'string' ? part : part.text)
                        .filter(text => text)
                        .join('\n');
                }
            }

            // Fallback for text if standard message not found
            if (!responseText) {
                 const potentialContent = data.output.find(item => 
                    item.type !== 'mcp_list_tools' && 
                    item.type !== 'reasoning' && 
                    item.type !== 'mcp_call' &&
                    (item.content || item.text || item.message)
                );
                
                if (potentialContent) {
                     if (typeof potentialContent.content === 'string') responseText = potentialContent.content;
                     else if (typeof potentialContent.text === 'string') responseText = potentialContent.text;
                     else if (potentialContent.message && typeof potentialContent.message.content === 'string') responseText = potentialContent.message.content;
                }
            }

            if (responseText) {
                responseItems.push({
                    type: 'text',
                    role: 'assistant',
                    content: responseText
                });
            }
        } 
        
        // Legacy/Fallback parsing (if no structured output extracted)
        if (responseItems.length === 0) {
            let responseText = null;
             if (typeof data.output === 'string') {
                responseText = data.output;
            } else {
                responseText = data.output_text ||
                               data.choices?.[0]?.message?.content ||
                               data.choices?.[0]?.text;
            }
            
            if (responseText) {
                 responseItems.push({ type: 'text', role: 'assistant', content: responseText });
            } else {
                console.warn('⚠️ Could not extract response text from:', JSON.stringify(data.output || data, null, 2));
                responseItems.push({ 
                    type: 'text', 
                    role: 'assistant', 
                    content: 'No text response generated. (Check console for details)' 
                });
            }
        }

        console.log('📝 Extracted items:', responseItems.length);
        return responseItems;
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

        if (role === 'system') {
            // System/Tool messages are pre-formatted HTML
            contentDiv.innerHTML = content;
        } else if (typeof content === 'string') {
            // Parse markdown-like formatting for standard messages
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
