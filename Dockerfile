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

# Expose port
EXPOSE 8080

# Use ENTRYPOINT with shell to properly expand and pass arguments
ENTRYPOINT ["/bin/sh", "-c", "exec mcp-proxy --port ${PORT:-8080} -- node dist/index.js"]
