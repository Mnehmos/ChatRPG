# ChatRPG Web Client

A lightweight web interface for the ChatRPG D&D 5e MCP server, powered by OpenAI's GPT-4o.

## Features

- 🎲 **Real-time Chat Interface** - Interactive D&D 5e assistant
- 🤖 **OpenAI Integration** - Uses GPT-4o for natural language understanding
- 🔌 **Remote MCP Server** - Connects to ChatRPG as an OpenAI remote tool
- 🎨 **Modern UI** - Clean, responsive design
- 🔒 **Secure Deployment** - API keys injected via GitHub Actions
- 📱 **Mobile Friendly** - Works on all devices

## Quick Start

### Local Development

1. **Copy the example configuration:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local` with your settings:**
   ```env
   MCP_SERVER_URL=https://chatrpg-production.up.railway.app/sse
   OPENAI_API_KEY=sk-proj-your-openai-api-key-here
   ```

3. **Run the setup script:**
   ```bash
   # On Windows (PowerShell):
   .\dev-setup.ps1

   # On Mac/Linux:
   ./dev-setup.sh
   ```

   The script will automatically create `index-dev.html` with your configuration and start a local server.

Alternatively, you can set up manually:

4. **Manual Setup - Create a local config file:**
   ```bash
   # Copy index.html to index-dev.html
   cp index.html index-dev.html
   ```

5. **Manual Setup - Inject local configuration:**
   ```bash
   # On Unix/Mac:
   sed -i "s|{{MCP_SERVER_URL}}|https://chatrpg-production.up.railway.app/sse|g" index-dev.html
   sed -i "s|{{OPENAI_API_KEY}}|your-openai-api-key|g" index-dev.html

   # On Windows (PowerShell):
   (Get-Content index-dev.html) -replace '{{MCP_SERVER_URL}}', 'https://chatrpg-production.up.railway.app/sse' | Set-Content index-dev.html
   (Get-Content index-dev.html) -replace '{{OPENAI_API_KEY}}', 'your-openai-api-key' | Set-Content index-dev.html
   ```

6. **Manual Setup - Serve the files:**
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .

   # Or use any other static file server
   ```

7. **Open in browser:**
   ```
   http://localhost:8000/index-dev.html
   ```

### GitHub Pages Deployment

1. **Set up GitHub Secrets:**
   - Go to your repository settings
   - Navigate to `Settings > Secrets and variables > Actions`
   - Add two secrets:
     - `MCP_SERVER_URL`: Your Railway ChatRPG server URL (e.g., `https://chatrpg-production.up.railway.app/sse`)
     - `OPENAI_API_KEY`: Your OpenAI API key from https://platform.openai.com/api-keys

2. **Enable GitHub Pages:**
   - Go to `Settings > Pages`
   - Source: `GitHub Actions`

3. **Push to main branch:**
   ```bash
   git add web-client/
   git commit -m "Add ChatRPG web client"
   git push origin main
   ```

4. **The GitHub Action will:**
   - Inject your secrets into the HTML
   - Deploy to GitHub Pages
   - Provide you with a URL (e.g., `https://username.github.io/ChatRPG/`)

## Project Structure

```
web-client/
├── index.html              # Main HTML file (with placeholders)
├── css/
│   └── style.css          # Styling
├── js/
│   └── app.js             # Main application logic (OpenAI API integration)
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Actions deployment
├── dev-setup.ps1          # Windows development setup script
├── dev-setup.sh           # Mac/Linux development setup script
├── .env.example           # Example environment variables
├── DEPLOYMENT.md          # Detailed deployment guide
└── README.md              # This file
```

## How It Works

### Architecture

```
User → Web Client → OpenAI API (GPT-4o) → ChatRPG MCP Server
                    ↑
              OPENAI_API_KEY
```

1. **User sends message** to the web client
2. **Web client calls OpenAI API** with:
   - The conversation history
   - ChatRPG configured as a remote MCP server in the `tools` array
3. **OpenAI (GPT-4o) processes the message** and decides which ChatRPG tools to use
4. **OpenAI connects to ChatRPG MCP server** to execute the tools
5. **Results flow back** through OpenAI to the web client

### Secret Injection

1. **During Development:**
   - Secrets are manually replaced in a local copy (`index-dev.html`)
   - Never commit `index-dev.html` or `.env.local`

2. **During Deployment:**
   - GitHub Actions reads secrets from repository settings
   - Replaces `{{MCP_SERVER_URL}}` and `{{OPENAI_API_KEY}}` placeholders
   - Deploys the processed HTML to GitHub Pages
   - Secrets are never exposed in the repository code

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MCP_SERVER_URL` | Your Railway ChatRPG MCP server SSE endpoint | Yes |
| `OPENAI_API_KEY` | Your OpenAI API key for GPT-4o inference | Yes |

### GitHub Secrets

Set these in `Settings > Secrets and variables > Actions`:

- `MCP_SERVER_URL`: `https://chatrpg-production.up.railway.app/sse`
- `OPENAI_API_KEY`: Your OpenAI API key (from https://platform.openai.com/api-keys)

## Security Notes

⚠️ **Important Security Considerations:**

1. **OpenAI API Key Protection:**
   - Never commit API keys to the repository
   - Use GitHub Secrets for deployment
   - For local dev, use `.env.local` (gitignored)
   - The API key will be visible in the deployed page source (injected at build time)
   - Consider using a dedicated API key with usage limits

2. **API Key Best Practices:**
   - Set usage limits on your OpenAI API key at https://platform.openai.com/usage
   - Monitor your OpenAI usage regularly
   - Don't share the deployed GitHub Pages URL publicly if using a personal API key
   - Consider implementing server-side API key management for production

3. **CORS Configuration:**
   - Ensure your Railway ChatRPG server has proper CORS headers
   - Allow your GitHub Pages domain (e.g., `https://username.github.io`)

## Troubleshooting

### Connection Issues

If the client can't connect to OpenAI:

1. **Check configuration:**
   ```javascript
   console.log(window.CHATRPG_CONFIG);
   // Should show { mcpServerUrl: "...", openaiApiKey: "sk-..." }
   ```

2. **Verify OpenAI API key:**
   - Check it's a valid key starting with `sk-proj-` or `sk-`
   - Verify it has credits at https://platform.openai.com/usage

3. **Check browser console:**
   - Look for OpenAI API errors (401 = invalid key, 429 = rate limit)
   - Verify network tab shows calls to `api.openai.com`

### API Key Issues

If OpenAI authentication fails:

1. **Verify secret is set:**
   - Check GitHub repository secrets
   - Ensure no typos in secret names

2. **Check injection worked:**
   - View page source after deployment
   - Should NOT see `{{OPENAI_API_KEY}}` placeholder
   - Should see actual key like `sk-proj-...`

3. **Test the API key:**
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

## Development Tips

### Testing Locally Without Secrets

Edit `index.html` directly for quick testing:

```javascript
window.CHATRPG_CONFIG = {
    mcpServerUrl: 'https://chatrpg-production.up.railway.app/sse',
    openaiApiKey: 'sk-proj-your-actual-openai-key'
};
```

**Note:** The OpenAI API key is required for the client to function.

### Debugging

Open browser DevTools and check:

```javascript
// View current config
window.CHATRPG_CONFIG

// Check if app is processing
chatApp.isProcessing

// View conversation history
chatApp.conversationHistory

// Monitor network tab for OpenAI API calls
// Should see POST requests to https://api.openai.com/v1/chat/completions
```

## Contributing

1. Test locally first with `index-dev.html`
2. Never commit secrets or API keys
3. Ensure `.env.local` and `index-dev.html` are gitignored
4. Test GitHub Actions deployment in a fork first

## License

Same as the main ChatRPG project.

## Links

- [ChatRPG Main Repository](https://github.com/Mnehmos/ChatRPG)
- [Railway Deployment](https://chatrpg-production.up.railway.app)
- [MCP Documentation](https://modelcontextprotocol.io)
