#!/bin/bash
# Local Development Setup Script for ChatRPG Web Client

echo "ChatRPG Web Client - Local Development Setup"
echo "============================================="
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found!"
    echo "📝 Creating .env.local from template..."
    cp .env.example .env.local
    echo "✅ Created .env.local"
    echo ""
    echo "⚠️  Please edit .env.local with your settings:"
    echo "   - CHATRPG_SERVER_URL"
    echo "   - CHATRPG_API_KEY (optional)"
    echo ""
    exit 1
fi

# Read environment variables
source .env.local

# Validate configuration
if [ -z "$CHATRPG_SERVER_URL" ]; then
    echo "❌ CHATRPG_SERVER_URL not set in .env.local"
    exit 1
fi

echo "📋 Configuration:"
echo "   Server URL: $CHATRPG_SERVER_URL"
echo "   API Key: ${CHATRPG_API_KEY:+***SET***}"
echo ""

# Create development version of index.html
echo "🔧 Creating index-dev.html..."
cp index.html index-dev.html

# Inject configuration
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # macOS and Linux
    sed -i.bak "s|{{SERVER_URL}}|$CHATRPG_SERVER_URL|g" index-dev.html
    sed -i.bak "s|{{API_KEY}}|${CHATRPG_API_KEY:-}|g" index-dev.html
    rm index-dev.html.bak
else
    # Windows Git Bash
    sed -i "s|{{SERVER_URL}}|$CHATRPG_SERVER_URL|g" index-dev.html
    sed -i "s|{{API_KEY}}|${CHATRPG_API_KEY:-}|g" index-dev.html
fi

echo "✅ Created index-dev.html with your configuration"
echo ""

# Start local server
echo "🚀 Starting local development server..."
echo "📱 Open http://localhost:8000/index-dev.html in your browser"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Try different server options
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m http.server 8000
elif command -v npx &> /dev/null; then
    npx serve . -l 8000
else
    echo "❌ No suitable HTTP server found!"
    echo "   Install Python or Node.js to run a local server"
    echo ""
    echo "   Or manually open: file://$(pwd)/index-dev.html"
fi
