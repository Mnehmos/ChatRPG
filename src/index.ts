#!/usr/bin/env node
/**
 * RPG-Lite MCP Server
 * Lightweight D&D 5e LLM-as-DM Engine
 * 50 Core Tools • Rich Markdown Output
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Tool Registry (Static Loading)
import { toolRegistry, handleToolCall } from './registry.js';

const server = new Server(
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
server.setRequestHandler(ListToolsRequestSchema, async () => {
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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🎲 RPG-Lite MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
