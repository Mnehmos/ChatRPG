/**
 * MCP Client for SSE Communication
 * Handles connection to ChatRPG MCP server over Server-Sent Events
 */

class MCPClient {
    constructor(serverUrl, apiKey) {
        this.serverUrl = serverUrl;
        this.apiKey = apiKey;
        this.eventSource = null;
        this.messageHandlers = new Map();
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.sessionId = this.generateSessionId();
    }

    generateSessionId() {
        return `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                // Construct SSE URL with session ID
                const url = new URL(this.serverUrl);
                url.searchParams.set('session', this.sessionId);

                if (this.apiKey) {
                    url.searchParams.set('key', this.apiKey);
                }

                console.log('Connecting to MCP server:', url.toString().replace(this.apiKey || '', '***'));

                this.eventSource = new EventSource(url.toString());

                this.eventSource.onopen = () => {
                    console.log('SSE connection opened');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    this.emit('connection', { status: 'connected' });
                    resolve();
                };

                this.eventSource.onerror = (error) => {
                    console.error('SSE connection error:', error);
                    this.connected = false;
                    this.emit('connection', { status: 'error', error });

                    if (this.eventSource.readyState === EventSource.CLOSED) {
                        this.handleReconnect();
                    }
                };

                this.eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (err) {
                        console.error('Error parsing SSE message:', err);
                    }
                };

                // Handle specific event types
                this.eventSource.addEventListener('tool_response', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleToolResponse(data);
                    } catch (err) {
                        console.error('Error parsing tool response:', err);
                    }
                });

                this.eventSource.addEventListener('error', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.emit('error', data);
                    } catch (err) {
                        console.error('Error parsing error event:', err);
                    }
                });

            } catch (error) {
                console.error('Failed to create SSE connection:', error);
                reject(error);
            }
        });
    }

    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.emit('connection', { status: 'failed' });
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.emit('connection', { status: 'reconnecting', attempt: this.reconnectAttempts });

        setTimeout(() => {
            this.connect().catch(err => {
                console.error('Reconnection failed:', err);
            });
        }, delay);
    }

    handleMessage(data) {
        console.log('Received message:', data);
        this.emit('message', data);
    }

    handleToolResponse(data) {
        console.log('Received tool response:', data);
        this.emit('tool_response', data);
    }

    async callTool(toolName, parameters = {}) {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        try {
            const response = await fetch(`${this.serverUrl.replace('/sse', '')}/tool`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
                },
                body: JSON.stringify({
                    session: this.sessionId,
                    tool: toolName,
                    parameters: parameters
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Tool call failed: ${error}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error calling tool:', error);
            throw error;
        }
    }

    async chat(message) {
        // Simple chat interface - the server should handle routing to appropriate tools
        return this.callTool('chat', { message });
    }

    on(event, handler) {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, []);
        }
        this.messageHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.messageHandlers.has(event)) {
            const handlers = this.messageHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.messageHandlers.has(event)) {
            this.messageHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (err) {
                    console.error('Error in event handler:', err);
                }
            });
        }
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.connected = false;
        this.emit('connection', { status: 'disconnected' });
    }

    isConnected() {
        return this.connected;
    }
}

// Export for use in app.js
window.MCPClient = MCPClient;
