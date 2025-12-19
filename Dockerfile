FROM node:20-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci

# Install mcp-proxy globally
RUN npm install -g mcp-proxy

# Copy source and build
COPY . .
RUN npm run build

# Railway provides PORT dynamically, mcp-proxy uses --port flag
# Default to 8080 if PORT not set
ENV PORT=8080
EXPOSE 8080

# mcp-proxy wraps the stdio-based MCP server into HTTP endpoints
# Use shell form to expand $PORT variable
CMD mcp-proxy --port $PORT -- node dist/index.js
