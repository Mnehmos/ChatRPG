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

# Make startup script executable
RUN chmod +x start.sh

# Expose port
EXPOSE 8080

# Use script to handle argument passing
CMD ["./start.sh"]
