FROM node:20-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Expose port
EXPOSE 8080

# Run the native HTTP server directly - no mcp-proxy needed!
CMD ["node", "dist/http-server.js"]
