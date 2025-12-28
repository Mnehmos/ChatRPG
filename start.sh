#!/bin/sh
# Start mcp-proxy with the MCP server
# Uses PORT env var from Railway, defaults to 8080
exec mcp-proxy --port ${PORT:-8080} -- node dist/index.js
