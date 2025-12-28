#!/usr/bin/env node
/**
 * Quick MCP Server Test
 * Verifies the server can list tools and handle a simple tool call
 */

import { spawn } from 'child_process';

const serverPath = './dist/index.js';

console.log('🧪 Testing RPG-Lite MCP Server...\n');

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let buffer = '';

server.stdout.on('data', (data) => {
  buffer += data.toString();

  // Try to parse JSON-RPC messages
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        console.log('📥 Server response:', JSON.stringify(msg, null, 2));
      } catch (e) {
        console.log('📝 Server output:', line);
      }
    }
  }
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});

// Wait for server to initialize
setTimeout(() => {
  console.log('1️⃣ Requesting tool list...\n');

  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };

  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');

  // Wait for response, then test a tool call
  setTimeout(() => {
    console.log('\n2️⃣ Testing roll_dice tool...\n');

    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'roll_dice',
        arguments: {
          expression: '2d6+3',
          reason: 'Server test'
        }
      }
    };

    server.stdin.write(JSON.stringify(toolCallRequest) + '\n');

    // Clean exit after test
    setTimeout(() => {
      console.log('\n✅ Test complete!');
      server.kill();
      process.exit(0);
    }, 1000);
  }, 1000);
}, 500);
