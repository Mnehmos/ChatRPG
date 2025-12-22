/**
 * ChatRPG Web Client - OpenAI API Integration
 * Uses OpenAI's API with ChatRPG as a remote MCP server
 */

class ChatApp {
    constructor() {
        this.conversationHistory = [];
        this.isProcessing = false;
        this.currentModel = 'openai'; // Default to OpenAI

        // DOM elements
        this.messagesContainer = document.getElementById('messages');
        this.userInput = document.getElementById('user-input');
        this.sendButton = document.getElementById('send-button');
        this.statusIndicator = document.querySelector('.status-indicator');
        this.statusText = document.querySelector('.status-text');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.typingText = this.typingIndicator?.querySelector('.typing-text');
        this.modelSelect = document.getElementById('model-select');

        this.init();
    }

    init() {
        // Check config - need at least one API key
        const hasOpenAI = window.CHATRPG_CONFIG?.openaiApiKey &&
                          !window.CHATRPG_CONFIG.openaiApiKey.includes('{{');
        const hasOpenRouter = window.CHATRPG_CONFIG?.openrouterApiKey &&
                              !window.CHATRPG_CONFIG.openrouterApiKey.includes('{{');

        if (!hasOpenAI && !hasOpenRouter) {
            this.showError('Configuration error: No API keys configured');
            this.updateStatus('error', 'Not configured');
            return;
        }

        if (!window.CHATRPG_CONFIG.mcpServerUrl) {
            this.showError('Configuration error: MCP server URL not set');
            this.updateStatus('error', 'Not configured');
            return;
        }

        // Disable unavailable model options
        if (this.modelSelect) {
            const openaiOption = this.modelSelect.querySelector('option[value="openai"]');
            const openrouterOption = this.modelSelect.querySelector('option[value="openrouter"]');

            if (!hasOpenAI && openaiOption) {
                openaiOption.disabled = true;
                openaiOption.textContent += ' (not configured)';
            }
            if (!hasOpenRouter && openrouterOption) {
                openrouterOption.disabled = true;
                openrouterOption.textContent += ' (not configured)';
            }

            // Set default to first available model
            if (!hasOpenAI && hasOpenRouter) {
                this.modelSelect.value = 'openrouter';
                this.currentModel = 'openrouter';
            }
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

        // Model selector
        if (this.modelSelect) {
            this.modelSelect.addEventListener('change', (e) => {
                this.currentModel = e.target.value;
                console.log('🔄 Switched to model:', this.currentModel);
            });
        }
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

        try {
            // Call the selected model's API with ChatRPG as remote MCP server (streaming)
            const response = this.currentModel === 'openrouter'
                ? await this.callOpenRouter(message)
                : await this.callOpenAI(message);

            // Handle response - text may have been streamed to UI already
            if (response) {
                console.log('📬 Processing response items:', response.length, response);
                if (Array.isArray(response)) {
                    // Handle list of response items (tools + text)
                    response.forEach((item, idx) => {
                        console.log(`📬 Item ${idx}:`, item.type, item.role, '_alreadyRendered:', item._alreadyRendered);
                        // Skip text items if streaming already rendered them
                        if (item._alreadyRendered) {
                            // Just add to history, don't re-render
                            this.conversationHistory.push({
                                role: 'assistant',
                                content: item.content
                            });
                        } else {
                            console.log(`🎨 RENDERING item ${idx} with role=${item.role}:`, item.content?.substring(0, 100));
                            this.addMessage(item.role || 'assistant', item.content);
                            if (item.type === 'text') {
                                this.conversationHistory.push({
                                    role: 'assistant',
                                    content: item.content
                                });
                            }
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
            this.showError(`Failed to get response: ${error.message}`);
            this.updateStatus('error', 'Error');
        } finally {
            this.isProcessing = false;
            this.updateInputState();
        }
    }

    async callOpenAI(userMessage) {
        // System prompt - placed first to maximize cache hits
        const systemPrompt = `You are a Dungeon Master running a D&D 5e campaign. The user is the PLAYER.

## CRITICAL: Always Use Tools
You MUST use ChatRPG tools for ALL game mechanics. Never describe what tools can do - just USE them.
- Player asks to attack? -> Call execute_action immediately
- Player wants to create a character? -> Call create_character immediately
- Player wants to check something? -> Call roll_check immediately
- Starting a fight? -> Call create_encounter immediately

DO NOT list available tools or explain capabilities. Just take action.

## Response Pattern
1. Brief narrative setup (1-2 sentences max)
2. CALL THE TOOL - this is mandatory
3. Narrate the result dramatically

## Example
Player: "I attack the goblin with my sword"
You: "You raise your blade, firelight glinting off the steel—" [call execute_action] "—and bring it crashing down! The goblin shrieks as your sword bites deep, green blood spraying across the stone floor. It staggers back, clutching the wound."

## Combat Style
- Visceral, cinematic descriptions
- Build tension as HP drops
- Track battlefield position verbally
- Make crits feel EPIC, misses feel tense

## Non-Combat
- NPCs have distinct voices
- Environments use all senses
- Choices have consequences
- Reward creativity

You are the DM. Don't explain - PLAY.`;

        // Build conversation context (recent history for continuity)
        // Note: Current user message is already in history, so we include it in the context
        const conversationContext = this.conversationHistory
            .slice(-6) // Keep last 6 messages (3 exchanges) for context
            .map(msg => `${msg.role === 'user' ? 'Player' : 'DM'}: ${msg.content}`)
            .join('\n');

        // Structure: Static system prompt first, then conversation context (which includes current message)
        const fullInput = conversationContext
            ? `${systemPrompt}\n\n--- Recent Conversation ---\n${conversationContext}`
            : `${systemPrompt}\n\nPlayer: ${userMessage}`;

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.CHATRPG_CONFIG.openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-5-nano-2025-08-07',
                input: fullInput,
                stream: true, // Enable streaming for real-time token display
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

        // Handle streaming response (SSE)
        const data = await this.handleStreamingResponse(response);

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

        // Carry streaming flags through to response
        if (data._streamingHandled) {
            responseItems._streamingHandled = true;
            responseItems._streamingTextContent = data._streamingTextContent;
        }

        if (Array.isArray(data.output)) {
            // DEBUG: Log MCP calls in output
            const mcpCalls = data.output.filter(item => item.type === 'mcp_call');
            console.log('🔧 MCP calls found in output:', mcpCalls.length, mcpCalls);

            // 1. Extract Tool Calls - collect for async processing
            const mcpCallItems = data.output.filter(item => item.type === 'mcp_call');

            // Process each MCP call - re-fetch from server for clean UTF-8
            for (const item of mcpCallItems) {
                // OpenAI MCP uses: name (tool name), arguments (JSON string), output (result string)
                const toolName = item.name || item.tool_name || item.tool_call?.function?.name || 'unknown_tool';
                const status = item.status || 'unknown';
                const icon = status === 'completed' ? '✅' : (status === 'failed' ? '❌' : '🛠️');

                // DEBUG: Log full item structure
                console.log(`🔧 MCP Call [${toolName}]:`, JSON.stringify(item, null, 2));

                let content = `**${icon} Tool:** \`${toolName}\` (${status})`;

                // 1. Inputs (Arguments) - OpenAI sends as JSON string in "arguments"
                const rawArgs = item.arguments || item.args || item.input;
                let parsedArgs = null;

                if (rawArgs) {
                    let argsFormatted;
                    if (typeof rawArgs === 'string') {
                        try {
                            parsedArgs = JSON.parse(rawArgs);
                            argsFormatted = JSON.stringify(parsedArgs, null, 2);
                        } catch {
                            argsFormatted = rawArgs;
                        }
                    } else {
                        parsedArgs = rawArgs;
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

                // 3. Output - Re-fetch directly from MCP server for clean UTF-8!
                // This bypasses OpenAI's encoding corruption
                let outputText = '';

                if (status === 'completed' && parsedArgs) {
                    try {
                        // Call our MCP server directly to get clean output
                        const directResult = await this.callToolDirect(toolName, parsedArgs);
                        if (directResult) {
                            outputText = directResult;
                            console.log('🎯 Got clean output from direct call');
                        }
                    } catch (e) {
                        console.warn('Direct tool call failed, falling back to OpenAI output:', e);
                    }
                }

                // Fallback to OpenAI's output if direct call failed
                if (!outputText) {
                    const rawOutput = item.output || item.result;
                    if (rawOutput) {
                        if (typeof rawOutput === 'string') {
                            try {
                                const parsed = JSON.parse(rawOutput);
                                outputText = JSON.stringify(parsed, null, 2);
                            } catch {
                                outputText = rawOutput;
                            }
                        } else if (rawOutput.content && Array.isArray(rawOutput.content)) {
                            outputText = rawOutput.content
                                .filter(c => c.type === 'text')
                                .map(c => c.text)
                                .join('\n');
                        } else {
                            outputText = JSON.stringify(rawOutput, null, 2);
                        }
                    }
                }

                if (outputText) {
                    // Debug: Check if outputText is clean before insertion
                    console.log('📝 outputText before DOM insertion (first 100 chars):', outputText.substring(0, 100));
                    console.log('📝 Contains garbled pattern?', /Ã¢|â€/.test(outputText));
                    // Output shown prominently - no collapsible wrapper
                    content += `
<pre class="tool-output-display"><code>${outputText}</code></pre>`;
                }

                responseItems.push({
                    type: 'tool',
                    role: 'system', // Use system role for lighter styling
                    content: content
                });
            }

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

            // Only add text if not already handled by streaming
            if (responseText && !data._streamingHandled) {
                responseItems.push({
                    type: 'text',
                    role: 'assistant',
                    content: responseText
                });
            } else if (responseText && data._streamingHandled) {
                // Text was streamed - just mark it for history tracking
                responseItems.push({
                    type: 'text',
                    role: 'assistant',
                    content: responseText,
                    _alreadyRendered: true
                });
            }
        }

        // Legacy/Fallback parsing (if no structured output extracted and not streaming)
        if (responseItems.length === 0 && !data._streamingHandled) {
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

        console.log('📝 Extracted items:', responseItems.length, responseItems.map(i => ({type: i.type, role: i.role, hasContent: !!i.content, alreadyRendered: i._alreadyRendered})));
        return responseItems;
    }

    /**
     * Call OpenRouter API with the deepinfra/fp4 model
     * OpenRouter uses a different API format (OpenAI Chat Completions compatible)
     * Note: OpenRouter doesn't support MCP directly, so we handle tools manually
     */
    async callOpenRouter(userMessage) {
        // System prompt (same as OpenAI)
        const systemPrompt = `You are a Dungeon Master running a D&D 5e campaign. The user is the PLAYER.

## CRITICAL: Always Use Tools
You MUST use ChatRPG tools for ALL game mechanics. Never describe what tools can do - just USE them.
- Player asks to attack? -> Call execute_action immediately
- Player wants to create a character? -> Call create_character immediately
- Player wants to check something? -> Call roll_check immediately
- Starting a fight? -> Call create_encounter immediately

DO NOT list available tools or explain capabilities. Just take action.

## Response Pattern
1. Brief narrative setup (1-2 sentences max)
2. CALL THE TOOL - this is mandatory
3. Narrate the result dramatically

## Example
Player: "I attack the goblin with my sword"
You: "You raise your blade, firelight glinting off the steel—" [call execute_action] "—and bring it crashing down! The goblin shrieks as your sword bites deep, green blood spraying across the stone floor. It staggers back, clutching the wound."

## Combat Style
- Visceral, cinematic descriptions
- Build tension as HP drops
- Track battlefield position verbally
- Make crits feel EPIC, misses feel tense

## Non-Combat
- NPCs have distinct voices
- Environments use all senses
- Choices have consequences
- Reward creativity

You are the DM. Don't explain - PLAY.`;

        // Build messages array for OpenRouter (Chat Completions format)
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add conversation history
        for (const msg of this.conversationHistory.slice(-6)) {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        }

        // Fetch available tools from MCP server
        let tools = [];
        try {
            const toolsResponse = await this.fetchMcpTools();
            tools = toolsResponse.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema || { type: 'object', properties: {} }
                }
            }));
        } catch (e) {
            console.warn('Failed to fetch MCP tools:', e);
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.CHATRPG_CONFIG.openrouterApiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'ChatRPG'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: messages,
                stream: true,
                tools: tools.length > 0 ? tools : undefined
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenRouter API request failed');
        }

        // Handle streaming response and tool calls
        return await this.handleOpenRouterStream(response, tools);
    }

    /**
     * Fetch available tools from the MCP server
     */
    async fetchMcpTools() {
        const mcpUrl = window.CHATRPG_CONFIG.mcpServerUrl;
        const baseUrl = mcpUrl.replace(/\/sse$/, '');
        const toolsUrl = `${baseUrl}/tools`;

        const response = await fetch(toolsUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch MCP tools');
        }

        const data = await response.json();
        return data.tools || [];
    }

    /**
     * Handle OpenRouter streaming response with tool call support
     */
    async handleOpenRouterStream(response, availableTools) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentTextContent = '';
        let toolCalls = [];
        let currentToolCall = null;

        // Create streaming message element
        let streamingMessageDiv = null;
        let streamingContentDiv = null;

        const responseItems = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const eventData = line.slice(6);
                    if (eventData === '[DONE]') continue;

                    try {
                        const event = JSON.parse(eventData);
                        const delta = event.choices?.[0]?.delta;

                        if (delta?.content) {
                            currentTextContent += delta.content;

                            // Create or update streaming message
                            if (!streamingMessageDiv) {
                                streamingMessageDiv = document.createElement('div');
                                streamingMessageDiv.className = 'message assistant streaming';
                                streamingMessageDiv.dataset.timestamp = Date.now();
                                streamingContentDiv = document.createElement('div');
                                streamingContentDiv.className = 'message-content';
                                streamingMessageDiv.appendChild(streamingContentDiv);
                                this.messagesContainer.appendChild(streamingMessageDiv);
                            }

                            streamingContentDiv.innerHTML = this.formatMessage(currentTextContent) + '<span class="streaming-cursor">▌</span>';
                            this.scrollToBottom();
                        }

                        // Handle tool calls
                        if (delta?.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                if (tc.index !== undefined) {
                                    if (!toolCalls[tc.index]) {
                                        toolCalls[tc.index] = {
                                            id: tc.id || `call_${tc.index}`,
                                            name: '',
                                            arguments: ''
                                        };
                                    }
                                    if (tc.function?.name) {
                                        toolCalls[tc.index].name = tc.function.name;
                                        this.updateTypingIndicator(`Calling ${tc.function.name}...`);
                                    }
                                    if (tc.function?.arguments) {
                                        toolCalls[tc.index].arguments += tc.function.arguments;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE event:', e);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Finalize streaming message
        if (streamingMessageDiv) {
            streamingMessageDiv.classList.remove('streaming');
            if (streamingContentDiv) {
                streamingContentDiv.innerHTML = this.formatMessage(currentTextContent);
            }
        }

        // Execute tool calls and add results
        for (const tc of toolCalls) {
            if (!tc || !tc.name) continue;

            try {
                const args = JSON.parse(tc.arguments || '{}');
                const result = await this.callToolDirect(tc.name, args);

                const icon = result ? '✅' : '❌';
                let content = `**${icon} Tool:** \`${tc.name}\``;

                content += `
<details>
  <summary>📥 Inputs</summary>
  <pre><code class="language-json">${JSON.stringify(args, null, 2)}</code></pre>
</details>`;

                if (result) {
                    content += `
<pre class="tool-output-display"><code>${result}</code></pre>`;
                }

                responseItems.push({
                    type: 'tool',
                    role: 'system',
                    content: content
                });
            } catch (e) {
                console.error('Tool call failed:', tc.name, e);
            }
        }

        // Add text response if present (mark as already rendered if streamed)
        if (currentTextContent) {
            responseItems.push({
                type: 'text',
                role: 'assistant',
                content: currentTextContent,
                _alreadyRendered: !!streamingMessageDiv
            });
        }

        return responseItems;
    }

    /**
     * Handle streaming SSE response from OpenAI
     * Parses server-sent events and accumulates the response
     */
    async handleStreamingResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Accumulated data structure matching non-streaming format
        const data = {
            output: [],
            usage: null
        };

        // Track current streaming state
        let currentTextContent = '';
        let currentMcpCalls = new Map(); // Track MCP calls by ID
        let buffer = ''; // Buffer for incomplete SSE lines

        // Create streaming message element for real-time text display
        let streamingMessageDiv = null;
        let streamingContentDiv = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep incomplete last line in buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    const eventData = line.slice(6); // Remove 'data: ' prefix
                    if (eventData === '[DONE]') continue;

                    try {
                        const event = JSON.parse(eventData);

                        // Handle different event types
                        if (event.type === 'response.output_text.delta') {
                            // Streaming text delta
                            const delta = event.delta || '';
                            currentTextContent += delta;

                            // Create or update streaming message
                            if (!streamingMessageDiv) {
                                streamingMessageDiv = document.createElement('div');
                                streamingMessageDiv.className = 'message assistant streaming';
                                streamingMessageDiv.dataset.timestamp = Date.now();

                                streamingContentDiv = document.createElement('div');
                                streamingContentDiv.className = 'message-content';
                                streamingMessageDiv.appendChild(streamingContentDiv);
                                this.messagesContainer.appendChild(streamingMessageDiv);
                            }

                            // Update content with cursor
                            streamingContentDiv.innerHTML = this.formatMessage(currentTextContent) + '<span class="streaming-cursor">▌</span>';
                            this.scrollToBottom();

                        } else if (event.type === 'response.output_item.added' && event.item?.type === 'mcp_call') {
                            // MCP tool call added (new format)
                            const item = event.item;
                            const callId = item.id;
                            currentMcpCalls.set(callId, {
                                type: 'mcp_call',
                                name: item.name || 'unknown_tool',
                                arguments: item.arguments || '',
                                status: item.status || 'in_progress',
                                output: item.output,
                                error: item.error
                            });
                            this.updateStatus('connecting', `Calling ${item.name}...`);
                            this.updateTypingIndicator(`Calling ${item.name}...`);

                        } else if (event.type === 'response.mcp_call.in_progress') {
                            // MCP tool call in progress
                            const callId = event.item_id;
                            if (!currentMcpCalls.has(callId)) {
                                currentMcpCalls.set(callId, {
                                    type: 'mcp_call',
                                    name: 'unknown_tool',
                                    arguments: '',
                                    status: 'in_progress',
                                    output: null,
                                    error: null
                                });
                            }

                        } else if (event.type === 'response.mcp_call_arguments.done') {
                            // MCP tool call arguments finalized
                            const callId = event.item_id;
                            const mcpCall = currentMcpCalls.get(callId);
                            if (mcpCall) {
                                mcpCall.arguments = event.arguments || mcpCall.arguments;
                            }

                        } else if (event.type === 'response.output_item.done' && event.item?.type === 'mcp_call') {
                            // MCP tool call completed (final state in output_item.done)
                            const item = event.item;
                            const callId = item.id;
                            const mcpCall = currentMcpCalls.get(callId) || {};
                            currentMcpCalls.set(callId, {
                                type: 'mcp_call',
                                name: item.name || mcpCall.name || 'unknown_tool',
                                arguments: item.arguments || mcpCall.arguments || '',
                                status: item.status || 'completed',
                                output: item.output || mcpCall.output,
                                error: item.error || mcpCall.error
                            });
                            this.updateStatus('connecting', 'Thinking...');
                            this.updateTypingIndicator('Processing response...');

                        } else if (event.type === 'response.mcp_call.completed') {
                            // MCP tool call completed (legacy event)
                            const callId = event.item_id || event.call_id;
                            const mcpCall = currentMcpCalls.get(callId);
                            if (mcpCall) {
                                mcpCall.status = 'completed';
                                mcpCall.output = event.output || mcpCall.output;
                            }
                            this.updateStatus('connecting', 'Thinking...');
                            this.updateTypingIndicator('Processing response...');

                        } else if (event.type === 'response.mcp_call.failed') {
                            // MCP tool call failed
                            const callId = event.item_id || event.call_id;
                            const mcpCall = currentMcpCalls.get(callId);
                            if (mcpCall) {
                                mcpCall.status = 'failed';
                                mcpCall.error = event.error || mcpCall.error;
                            }

                        } else if (event.type === 'response.output_text.done') {
                            // Text output complete - finalize streaming message
                            if (streamingMessageDiv) {
                                streamingMessageDiv.classList.remove('streaming');
                                streamingContentDiv.innerHTML = this.formatMessage(currentTextContent);
                            }

                        } else if (event.type === 'response.done') {
                            // Full response complete - extract usage stats
                            if (event.response?.usage) {
                                data.usage = event.response.usage;
                            }
                        }

                    } catch (parseError) {
                        console.warn('Failed to parse SSE event:', eventData, parseError);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Finalize streaming message if still in progress
        if (streamingMessageDiv) {
            streamingMessageDiv.classList.remove('streaming');
            if (streamingContentDiv) {
                streamingContentDiv.innerHTML = this.formatMessage(currentTextContent);
            }
        }

        // Build final output array matching non-streaming format
        // Add MCP calls first
        for (const mcpCall of currentMcpCalls.values()) {
            data.output.push(mcpCall);
        }

        // Add text message if present
        if (currentTextContent) {
            data.output.push({
                type: 'message',
                role: 'assistant',
                content: currentTextContent
            });
        }

        // Mark that streaming was handled (so we don't re-render text)
        data._streamingHandled = true;
        data._streamingTextContent = currentTextContent;

        return data;
    }

    updateInputState() {
        this.sendButton.disabled = this.isProcessing;
        this.userInput.disabled = this.isProcessing;

        // Show/hide typing indicator based on processing state
        if (this.isProcessing) {
            this.showTypingIndicator('Generating response...');
        } else {
            this.hideTypingIndicator();
        }
    }

    /**
     * Show the typing indicator with a custom message
     * @param {string} message - The message to display
     */
    showTypingIndicator(message = 'Generating response...') {
        if (this.typingIndicator) {
            this.typingIndicator.classList.add('visible');
            if (this.typingText) {
                this.typingText.textContent = message;
            }
        }
    }

    /**
     * Hide the typing indicator
     */
    hideTypingIndicator() {
        if (this.typingIndicator) {
            this.typingIndicator.classList.remove('visible');
        }
    }

    /**
     * Update the typing indicator message without hiding it
     * @param {string} message - The new message to display
     */
    updateTypingIndicator(message) {
        if (this.typingText && this.typingIndicator?.classList.contains('visible')) {
            this.typingText.textContent = message;
        }
    }

    /**
     * Call MCP tool directly to get clean UTF-8 output.
     * This bypasses OpenAI's encoding corruption by calling our server directly.
     *
     * @param {string} toolName - Name of the tool to call
     * @param {object} args - Tool arguments
     * @returns {Promise<string|null>} - Tool output text or null on failure
     */
    async callToolDirect(toolName, args) {
        try {
            // Get MCP server URL from config, convert to base URL
            const mcpUrl = window.CHATRPG_CONFIG.mcpServerUrl;
            // Extract base URL (remove /sse if present)
            const baseUrl = mcpUrl.replace(/\/sse$/, '');
            const toolUrl = `${baseUrl}/tool`;

            console.log(`🎯 Direct tool call to ${toolUrl}:`, toolName, args);
            this.updateTypingIndicator(`Fetching ${toolName} output...`);

            const response = await fetch(toolUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify({
                    name: toolName,
                    arguments: args
                })
            });

            if (!response.ok) {
                console.error(`❌ Direct tool call failed: ${response.status} ${response.statusText}`);
                return null;
            }

            const result = await response.json();
            console.log('✅ Direct tool call succeeded, result:', result);

            // Extract text from MCP content format
            if (result.content && Array.isArray(result.content)) {
                const textParts = result.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text);
                const output = textParts.join('\n');
                // Log first 200 chars to verify encoding
                console.log('📄 Direct output preview:', output.substring(0, 200));
                return output;
            }

            console.warn('⚠️ No content array in result:', result);
            return null;
        } catch (e) {
            console.error('❌ Direct tool call error:', e);
            return null;
        }
    }

    addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.dataset.timestamp = Date.now();

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (role === 'system') {
            // System/Tool messages are pre-formatted HTML
            // Direct tool calls return clean UTF-8, no repair needed
            contentDiv.innerHTML = content;
        } else if (typeof content === 'string') {
            // Parse markdown-like formatting for standard messages
            // (formatMessage already calls repairEncoding)
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

    /**
     * Repair double-encoded UTF-8 text.
     * This fixes the issue where UTF-8 characters get interpreted as Latin-1/Windows-1252
     * and then re-encoded, causing garbled output like "Ã¢â€¢Â" instead of "•"
     */
    repairEncoding(text) {
        if (!text || typeof text !== 'string') return text;

        // Check if text contains common double-encoding patterns
        // These are UTF-8 sequences that were decoded as Windows-1252
        const hasDoubleEncoding = /Ã[¢£€¡]|â€[™š›œžŸ¦¹""|â€¢|Â[·°±²³´¶¸¼½¾]/.test(text);

        if (!hasDoubleEncoding) return text;

        try {
            // Convert the string to bytes as if it were Latin-1, then decode as UTF-8
            // This reverses the double-encoding
            const bytes = new Uint8Array([...text].map(c => c.charCodeAt(0) & 0xFF));
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

            // Verify the repair worked (should have fewer bytes and proper characters)
            if (decoded && decoded.length < text.length * 0.9) {
                console.log('🔧 Repaired encoding:', text.substring(0, 50), '→', decoded.substring(0, 50));
                return decoded;
            }
        } catch (e) {
            console.warn('Encoding repair failed:', e);
        }

        return text;
    }

    formatMessage(text) {
        // First repair any encoding issues
        text = this.repairEncoding(text);

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
