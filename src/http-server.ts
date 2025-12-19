/**
 * RPG-Lite MCP Server - HTTP/SSE Server
 * Native HTTP server with SSE support for Railway deployment
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer } from 'http';
import { URL } from 'url';

// Tool Registry (Static Loading)
import { toolRegistry, handleToolCall } from './registry.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

// Create MCP server
const mcpServer = new Server(
  {
    name: 'rpg-lite-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const tools = Object.values(toolRegistry).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    console.error(`[MCP] Returning ${tools.length} tools`);
    return { tools };
  } catch (error) {
    console.error('[MCP] Error listing tools:', error);
    throw error;
  }
});

// Handle tool calls
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

// Store active transports
const transports = new Map<string, SSEServerTransport>();

// Create HTTP server
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ChatGPT Domain Verification
  if (url.pathname === '/.well-known/openai-apps-challenge') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('z_slwoyiGAGJ3pMiud-a-0ZAkrG10ZAKP-sMSB1fLpw');
    return;
  }

  // Health check
  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'rpg-lite-mcp', version: '0.1.0' }));
    return;
  }

  // SSE endpoint - client initiates connection here
  if (url.pathname === '/sse') {
    console.error('[HTTP] SSE connection request');
    
    if (req.method === 'GET') {
      // Generate session ID for this connection
      const sessionId = crypto.randomUUID();
      
      // Create SSE transport
      const transport = new SSEServerTransport(`/message/${sessionId}`, res);
      transports.set(sessionId, transport);
      
      // Connect MCP server to this transport
      await mcpServer.connect(transport);
      
      console.error(`[HTTP] SSE connection established: ${sessionId}`);
      
      // Clean up on close
      req.on('close', () => {
        console.error(`[HTTP] SSE connection closed: ${sessionId}`);
        transports.delete(sessionId);
      });
      
      return;
    }
    
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  // Message endpoint - client sends messages here
  if (url.pathname.startsWith('/message/')) {
    const sessionId = url.pathname.split('/')[2];
    const transport = transports.get(sessionId);
    
    if (!transport) {
      res.writeHead(404);
      res.end('Session not found');
      return;
    }
    
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          await transport.handlePostMessage(req, res, body);
        } catch (error) {
          console.error('[HTTP] Error handling message:', error);
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      });
      return;
    }
    
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  // 404 for unknown paths
  res.writeHead(404);
  res.end('Not Found');
});

// Start server
httpServer.listen(PORT, () => {
  console.error(`🎲 RPG-Lite MCP Server running on port ${PORT}`);
  console.error(`   SSE endpoint: http://localhost:${PORT}/sse`);
  console.error(`   Health check: http://localhost:${PORT}/health`);
});
