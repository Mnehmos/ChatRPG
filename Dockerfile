FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive \
    GLAMA_VERSION="1.0.0"
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g mcp-proxy@5.12.0 pnpm@10.14.0 && \
    node --version && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
WORKDIR /app
COPY . .
RUN pnpm install && pnpm run build
EXPOSE 8080
CMD ["mcp-proxy", "--", "node", "dist/index.js"]
